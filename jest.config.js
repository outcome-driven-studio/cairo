module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/test/**/*.test.js'],
  clearMocks: true,
  setupFiles: ['<rootDir>/src/test/jest.setup.js'],
};
