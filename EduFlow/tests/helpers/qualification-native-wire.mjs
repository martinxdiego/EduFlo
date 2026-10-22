// Independent x64 v4 encoder for parser tests. No native invocation or authority.
export function nativeObservationFixture() {
  const parts = [], offsets = {}; let length = 0
  const add = (name, bytes) => { offsets[name] = length; parts.push(bytes); length += bytes.length }
  const word = (b, at, value) => b.writeUInt32LE(value, at)
  const str = (b, at, value) => b.write(value, at, 'utf16le')
  const h = Buffer.alloc(232)
  for (const [at, value] of [[0, 0x51464445], [4, 4], [8, 176], [12, 1], [176, 1], [184, 1], [188, 1], [228, 8]]) word(h, at, value)
  for (let n = 0; n < 5; n++) h.fill(n + 1, 16 + n * 32, 48 + n * 32)
  h.fill(6, 196, 228); add('header', h)
  const token = Buffer.alloc(1208)
  for (const [at, value] of [[0, 1], [4, 1], [8, 1], [12, 1], [16, 3]]) word(token, at, value)
  for (const at of [40, 48, 64]) token.writeBigUInt64LE(1n, at)
  str(token, 72, 'S-1-5-18'); str(token, 440, 'S-1-5-18'); str(token, 808, 'S-1-16-8192'); token.fill(7, 1176)
  add('token', token)
  const object = Buffer.alloc(544)
  word(object, 4, 16); word(object, 12, 40); word(object, 16, 0x8004); object.writeBigUInt64LE(1n, 24)
  object.fill(8, 32, 48); str(object, 48, 'S-1-5-18'); add('object', object)
  const sd = Buffer.alloc(40); sd[0] = 1; sd.writeUInt16LE(0x8004, 2); word(sd, 4, 28); word(sd, 16, 20)
  sd[20] = 2; sd.writeUInt16LE(8, 22); sd[28] = 1; sd[29] = 1; sd[35] = 5; word(sd, 36, 18); add('descriptor', sd)
  function fact(name, kind, payload) { const frame = Buffer.alloc(16); word(frame, 0, kind); word(frame, 8, payload.length); add(`${name}Header`, frame); add(name, payload) }
  const resolution = Buffer.alloc(80); word(resolution, 0, 0xffffffff); word(resolution, 4, 1); resolution.fill(9, 16, 48); fact('resolution', 1, resolution)
  const volume = Buffer.alloc(192); volume.writeBigUInt64LE(1n); for (const at of [24, 32, 36, 40, 44]) word(volume, at, 1); fact('volume', 2, volume)
  fact('mandatory', 3, Buffer.alloc(376)); fact('handles', 4, Buffer.alloc(4)); fact('filters', 5, Buffer.alloc(4))
  fact('primary', 6, Buffer.from(token)); const context = Buffer.alloc(112); context.fill(10, 48); fact('context', 7, context)
  const access = Buffer.alloc(148); word(access, 0, 1)
  for (const base of [4, 76]) { word(access, base, 1); word(access, base + 4, 72); word(access, base + 32, 1); word(access, base + 48, 8192); word(access, base + 52, 8192); word(access, base + 60, 1) }
  fact('access', 8, access)
  word(h, 192, length - 232)
  return { bytes: Buffer.concat(parts), offsets }
}
