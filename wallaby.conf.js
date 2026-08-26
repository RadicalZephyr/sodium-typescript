module.exports = function () {
  return {
    files: [
      'src/**/*.ts?(x)',
      'src/**/*.snap',
      '!src/**/*.spec.ts?(x)'
    ],
    tests: [
      'src/**/*.spec.ts?(x)'
    ],

    env: {
      type: 'node',
      runner: 'node'
    },

    testFramework: 'jest',



    debug: true
  };
};
