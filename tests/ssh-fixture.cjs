const { Server, utils } = require('ssh2');
const { generateKeyPairSync } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const S = utils.sftp.STATUS_CODE;
const attrs = stat => ({ mode: stat.mode, uid: 1000, gid: 1000, size: stat.size, atime: Math.floor(stat.atimeMs / 1000), mtime: Math.floor(stat.mtimeMs / 1000) });

module.exports = async function startSSH(root) {
  const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'pkcs1', format: 'pem' } }).privateKey;
  const clients = new Set(), commands = [];
  const server = new Server({ hostKeys: [privateKey] }, client => {
    clients.add(client); client.on('close', () => clients.delete(client)); client.on('error', () => {});
    client.on('authentication', context => context.method === 'password' && context.username === 'tester' && context.password === 'test-only' ? context.accept() : context.reject());
    client.on('ready', () => client.on('session', accept => {
      const session = accept();
      session.on('pty', accept => accept());
      session.on('exec', (accept, _reject, info) => { commands.push(info.command); const stream = accept(); setTimeout(() => { stream.write('LUMA_REMOTE_EXEC_OK\n'); stream.exit(0); stream.end(); }, 60); });
      session.on('shell', accept => { const stream = accept(); stream.write('LUMA_SSH_READY\r\n$ '); stream.on('data', data => stream.write(data)); });
      session.on('sftp', accept => {
        const sftp = accept(), handles = new Map(); let counter = 0;
        const local = remote => { const normalized = path.posix.resolve('/project', remote); if (normalized !== '/project' && !normalized.startsWith('/project/')) throw Error('outside root'); return path.join(root, normalized.slice('/project'.length)); };
        const failure = (id, e) => sftp.status(id, e.code === 'ENOENT' ? S.NO_SUCH_FILE : S.FAILURE, e.message);
        const register = (event, callback) => sftp.on(event, (...args) => Promise.resolve().then(() => callback(...args)).catch(e => failure(args[0], e)));
        const handle = value => { const id = ++counter, buffer = Buffer.alloc(4); buffer.writeUInt32BE(id); handles.set(id, value); return buffer; };
        const get = buffer => handles.get(buffer.readUInt32BE());
        register('REALPATH', async (id, remote) => { const full = local(remote); await fs.stat(full); sftp.name(id, [{ filename: '/project' + path.relative(root, full).replace(/\\/g, '/').replace(/^(.+)$/, '/$1'), longname: '', attrs: {} }]); });
        register('STAT', async (id, remote) => sftp.attrs(id, attrs(await fs.stat(local(remote)))));
        register('LSTAT', async (id, remote) => sftp.attrs(id, attrs(await fs.lstat(local(remote)))));
        register('OPENDIR', async (id, remote) => { const full = local(remote); sftp.handle(id, handle({ dir: full, read: false })); });
        register('READDIR', async (id, buffer) => { const state = get(buffer); if (state.read) return sftp.status(id, S.EOF); state.read = true; const names = await fs.readdir(state.dir); sftp.name(id, await Promise.all(names.map(async name => ({ filename: name, longname: name, attrs: attrs(await fs.stat(path.join(state.dir, name))) })))); });
        register('OPEN', async (id, remote, flags) => { const file = await fs.open(local(remote), utils.sftp.flagsToString(flags)); sftp.handle(id, handle({ file })); });
        register('FSTAT', async (id, buffer) => sftp.attrs(id, attrs(await get(buffer).file.stat())));
        register('READ', async (id, buffer, offset, length) => { const data = Buffer.alloc(length), result = await get(buffer).file.read(data, 0, length, offset); if (!result.bytesRead) sftp.status(id, S.EOF); else sftp.data(id, data.subarray(0, result.bytesRead)); });
        register('WRITE', async (id, buffer, offset, data) => { await get(buffer).file.write(data, 0, data.length, offset); sftp.status(id, S.OK); });
        register('CLOSE', async (id, buffer) => { const state = get(buffer); if (state.file) await state.file.close(); handles.delete(buffer.readUInt32BE()); sftp.status(id, S.OK); });
        register('MKDIR', async (id, remote) => { await fs.mkdir(local(remote)); sftp.status(id, S.OK); });
        register('RENAME', async (id, old, next) => { await fs.rename(local(old), local(next)); sftp.status(id, S.OK); });
      });
    }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { port: server.address().port, commands, close: async () => { for (const client of clients) client.end(); await new Promise(resolve => server.close(resolve)); } };
};
