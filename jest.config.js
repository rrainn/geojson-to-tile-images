module.exports = {
	"preset": "ts-jest",
	"testEnvironment": "node",
	"testMatch": ["**/src/**/*.test.[jt]s?(x)"],
	"coverageReporters": ["json", "lcov", "text", "html"],
	"transformIgnorePatterns": ["dist/.+\\.js"]
};
