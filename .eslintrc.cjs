module.exports = {
  extends: 'es/node',

  'parserOptions': {
    'sourceType': 'module'
  },

  rules : {
    'array-bracket-spacing': [2, 'never'],
    'capitalized-comments': 0,
    'comma-dangle': [2, 'always-multiline'],
    'dot-location': [2, 'property'],
    'eslint-comments/disable-enable-pair': 0,
    'indent': [
      2,
      2,
      {
        CallExpression: {arguments: 'off'},
        ignoreComments: true,
        MemberExpression: 'off',
        SwitchCase: 1,
        VariableDeclarator: {
          var: 2,
          let: 2,
          const: 3,
        },
      }
    ],
    'key-spacing': 0,
    'keyword-spacing': 0,
    'line-comment-position': 0,
    'lines-around-comment': 0,
    'max-len': ['error', 120],
    'max-statements-per-line': ['error', {max: 2}],
    'mocha/no-return-from-async': 0,
    'no-inline-comments': 0,
    'no-mixed-operators': 0,
    'no-multi-spaces': 0,
    'no-multiple-empty-lines': 0,
    'no-plusplus': 0,
    'no-unused-vars': [2, {caughtErrors: 'none'}],
    'no-warning-comments': 0,
    'object-curly-spacing': [2, 'never'],
    'prefer-destructuring': 0,
    'require-unicode-regexp': 0,
    'sort-imports': 0,
    'space-before-function-paren': [2, 'never'],
    'unicorn/catch-error-name': 0,
    'unicorn/expiring-todo-comments': 0,
    'unicorn/explicit-length-check': 0,
    'unicorn/filename-case': 0,
    'unicorn/no-zero-fractions': 0,
    'unicorn/numeric-separators-style': 0
  }
};
