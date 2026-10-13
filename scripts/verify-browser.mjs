import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createPortServer } from 'node:net';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const output = resolve(root, '.browser-validation', String(Date.now()));
const downloads = resolve(output, 'downloads');
const browserBinary = process.env.SHADER_BROWSER_BIN || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const requests = [];
const errors = [];
const delay = milliseconds => new Promise(done => setTimeout(done, milliseconds));
async function retry(action, limit = 20000) {
    const deadline = Date.now() + limit;
    let last;
    do {
        try { return await action(); } catch (error) { last = error; await delay(100); }
    } while (Date.now() < deadline);
    throw last;
}

await readFile(resolve(dist, 'tutorial.html'));
await mkdir(downloads, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        requests.push(pathname);
        const file = resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(dist + sep)) { response.writeHead(403); response.end(); return; }
        const body = await readFile(file);
        response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
        response.end(body);
    } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = 'http://127.0.0.1:' + server.address().port;
const portServer = createPortServer();
await new Promise(done => portServer.listen(0, '127.0.0.1', done));
const debugPort = portServer.address().port;
await new Promise(done => portServer.close(done));
let browser, socket, call;

try {
    browser = spawn(browserBinary, ['--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle',
        '--use-angle=swiftshader', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
        '--disable-background-networking', '--remote-debugging-port=' + debugPort,
        '--user-data-dir=' + resolve(output, 'profile'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    const browserError = new Promise((_, reject) => browser.once('error', reject));
    const tabs = await Promise.race([retry(async () => {
        const response = await fetch('http://127.0.0.1:' + debugPort + '/json/list');
        return response.json();
    }), browserError]);
    socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const request = pending.get(message.id);
            if (!request) return;
            clearTimeout(request.timer);
            pending.delete(message.id);
            if (message.error) request.reject(new Error(JSON.stringify(message.error)));
            else request.done(message.result);
        } else if (message.method === 'Runtime.exceptionThrown') {
            errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
        } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
            errors.push(message.params.args.map(argument => argument.value || argument.description).join(' '));
        }
    });
    call = (method, params = {}) => new Promise((done, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
        pending.set(id, { done, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
    async function evaluate(expression) {
        const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    }
    async function waitFor(expression) { return retry(async () => { assert.ok(await evaluate(expression), expression); }); }
    async function clickButton(label) {
        await evaluate('(() => { const button = [...document.querySelectorAll("button")].find(element => element.textContent === ' + JSON.stringify(label) + '); if (!button) throw new Error("Missing button"); button.click(); })()');
    }
    async function connectSockets(sourceLabel, socketLabel, targetLabel, inputLabel) {
        for (const [nodeLabel, selector, label] of [[sourceLabel, '.ne-socket-out', socketLabel], [targetLabel, '.ne-socket-in', inputLabel]]) {
            await evaluate('(() => { const node = [...document.querySelectorAll(".ne-no")].find(element => element.querySelector(".ne-cabecalho").textContent.includes(' + JSON.stringify(nodeLabel) + ')); const button = [...node.querySelectorAll(' + JSON.stringify(selector) + ')].find(element => element.title.startsWith(' + JSON.stringify(label + ' ·') + ')); if (!button) throw new Error("Missing socket"); button.click(); })()');
        }
    }
    async function setNumber(nodeLabel, inputLabel, value) {
        await evaluate('(() => { const node = [...document.querySelectorAll(".ne-no")].find(element => element.querySelector(".ne-cabecalho").textContent.includes(' + JSON.stringify(nodeLabel) + ')); const row = [...node.querySelectorAll(".ne-linha")].find(element => element.querySelector(".ne-rotulo")?.textContent === ' + JSON.stringify(inputLabel) + '); const input = row.querySelector("input.ne-num"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ' + JSON.stringify(String(value)) + '); input.dispatchEvent(new Event("input", { bubbles:true })); })()');
    }
    async function importFile(file) {
        const document = await call('DOM.getDocument');
        const input = await call('DOM.querySelector', { nodeId: document.root.nodeId, selector: 'input[type="file"]' });
        await call('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [file] });
    }
    async function screenshot(name, selector) {
        await evaluate('document.querySelector(".preview-panel").scrollIntoView({block:"center"})');
        await evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))');
        const clip = await evaluate('(() => { const box = document.querySelector(' + JSON.stringify(selector) + ').getBoundingClientRect(); return {x:box.x + scrollX,y:box.y + scrollY,width:box.width,height:box.height,scale:1}; })()');
        const image = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
        await writeFile(resolve(output, name), Buffer.from(image.data, 'base64'));
    }

    await call('Runtime.enable');
    await call('Page.enable');
    await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: origin + '/tutorial.html' });
    await waitFor('document.querySelectorAll(".ne-no").length === 2 && !!document.querySelector(".practice-model canvas")');
    assert.equal(await evaluate('document.querySelector("progress").value'), 0);
    assert.equal(await evaluate('document.documentElement.lang'), 'en');
    assert.equal(await evaluate('document.querySelector("#lesson-title").textContent'), 'Procedural checker material');
    assert.ok(await evaluate('document.querySelector(".ne-barra").textContent.includes("Undo") && document.querySelector(".ne-barra").textContent.includes("Reset view")'));
    await clickButton('+ Node');
    await evaluate('[...document.querySelectorAll(".ne-menu button")].find(button => button.textContent === "Checker Texture").click()');
    await waitFor('document.querySelectorAll(".ne-no").length === 3');
    await connectSockets('Checker Texture', 'Color', 'Principled BSDF', 'Base Color');
    await setNumber('Checker Texture', 'Scale', 8);
    await setNumber('Principled BSDF', 'Roughness', 0.65);
    await connectSockets('Principled BSDF', 'BSDF', 'Material Output', 'Surface');
    await waitFor('document.querySelector("progress").value === 6');
    await clickButton('Load completed example');
    await screenshot('desktop.png', '.material-workspace');
    await clickButton('Export JSON');
    const exported = await retry(async () => {
        const files = await readdir(downloads);
        assert.ok(files.includes('checker.json'));
        const file = resolve(downloads, 'checker.json');
        const raw = JSON.parse(await readFile(file, 'utf8'));
        assert.equal(raw.connections.length, 2);
        return file;
    });
    await clickButton('Reset exercise');
    await waitFor('document.querySelector("progress").value === 0');
    await importFile(exported);
    await waitFor('document.querySelector("progress").value === 6');
    const invalid = resolve(output, 'invalid.json');
    await writeFile(invalid, '{');
    await importFile(invalid);
    await waitFor('document.querySelector("[role=alert]")?.textContent.includes("valid JSON")');
    assert.equal(await evaluate('document.querySelector("progress").value'), 6);
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await call('Page.reload');
    await waitFor('document.querySelectorAll(".ne-no").length === 2 && document.querySelector("progress").value === 0');
    await clickButton('Load completed example');
    await waitFor('document.querySelector("progress").value === 6');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
    await screenshot('mobile.png', '.material-workspace');
    await call('Page.navigate', { url: origin + '/index.html' });
    await waitFor('document.querySelectorAll(".ne-no").length === 2 && !document.querySelector("progress")');
    await clickButton('+ Node');
    assert.ok(await evaluate('document.querySelector(".ne-menu").textContent.includes("Checker Texture")'));
    assert.equal(requests.filter(path => path.startsWith('/api/')).length, 0);
    assert.deepEqual(errors, []);
    const result = { passed: true, manualRecipe: true, webgl: true, exportImport: true, invalidImportPreservesGraph: true,
        mobileNoOverflow: true, editorPage: true, englishInterface: true, apiRequests: 0, errors, output };
    await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
} finally {
    if (socket?.readyState === WebSocket.OPEN && call) { try { await call('Browser.close'); } catch {} }
    socket?.close();
    browser?.kill();
    server.closeAllConnections();
    await new Promise(done => server.close(done));
}
