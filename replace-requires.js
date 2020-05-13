var detective = require('@pre-bundled/detective')
var patch = require('patch-text')
var assert = require('assert')
var hasRequire = require('@pre-bundled/has-require')

module.exports = function replaceRequires (code, replacements) {
  var checker = new hasRequire.Checker(code)
  var ids = Object.keys(replacements)
  if (!ids.some(checker.has, checker)) return code

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
