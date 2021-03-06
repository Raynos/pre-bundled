var detective = require('@pre-bundled/detective')
var patch = require('patch-text')
var assert = require('assert')

const hasRequireRegex = /require\(['"]([^'"]+)['"]\)/

module.exports = function replaceRequires (code, replacements) {
  var ids = Object.keys(replacements)

  const hasRequire = hasRequireRegex.test(code)
  if (!hasRequire) return code

  const patches = detective
    .find(code, { nodes: true })
    .nodes
    .filter(requireLiteral)
    .map(function (node) {
      const copy = Object.assign({}, node)

      const value = node.arguments[0].value
      const replacement = replacements[value]
      if (replacement) {
        copy.replacement = replacement
      } else {
        for (const moduleName of ids) {
          if (value.startsWith(moduleName + '/')) {
            assert(replacements[moduleName].endsWith('")'))
            const replacement = replacements[moduleName].slice(0, -2)

            copy.replacement = replacement +
              value.slice(moduleName.length) + '")'
          }
        }
      }

      return copy
    })
    .filter(function (node) {
      return node.replacement != null
    })

  return patch(code, patches)
}

function requireLiteral (node) {
  var arg = node.arguments[0]
  return arg && arg.type === 'Literal'
}
