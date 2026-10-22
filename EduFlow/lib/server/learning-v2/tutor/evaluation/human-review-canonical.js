import { createHash } from 'node:crypto'

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertValidUnicodeScalarString(value) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xDC00 && next <= 0xDFFF)) throw new TypeError('JCS review strings must contain valid Unicode scalar sequences')
      index += 1
    } else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
      throw new TypeError('JCS review strings must contain valid Unicode scalar sequences')
    }
  }
  return value
}

// RFC 8785 uses ECMAScript JSON primitive serialization and UTF-16 code-unit
// ordering for object property names. Review contracts additionally restrict
// every numeric value to a safe integer so platform-dependent precision cannot
// enter a governance digest.
export function jcsCanonicalize(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'string') return JSON.stringify(assertValidUnicodeScalarString(value))
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('JCS review values must be safe integers')
    return JSON.stringify(Object.is(value, -0) ? 0 : value)
  }
  if (Array.isArray(value)) return `[${value.map((item) => jcsCanonicalize(item)).join(',')}]`
  if (!isPlainObject(value)) throw new TypeError('JCS review values must be JSON objects')
  const members = Object.keys(value).sort().map((key) => {
    assertValidUnicodeScalarString(key)
    if (value[key] === undefined) throw new TypeError('JCS review values cannot contain undefined')
    return `${JSON.stringify(key)}:${jcsCanonicalize(value[key])}`
  })
  return `{${members.join(',')}}`
}

export function jcsUtf8Bytes(value) {
  return Buffer.from(jcsCanonicalize(value), 'utf8')
}

export function domainSeparatedJcsSha256(prefix, value) {
  if (typeof prefix !== 'string' || !prefix.length) throw new TypeError('A domain-separation prefix is required')
  return `sha256:${createHash('sha256').update(Buffer.from(prefix, 'utf8')).update(jcsUtf8Bytes(value)).digest('hex')}`
}

export function utf8LexicographicCompare(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}
