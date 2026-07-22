export default {
	preset: 'ts-jest/presets/default-esm',
	testEnvironment: 'node',
	roots: ['<rootDir>/test'],
	testMatch: ['<rootDir>/test/**/*.test.ts'],
	extensionsToTreatAsEsm: ['.ts'],
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1'
	},
	transform: {
		'^.+\\.tsx?$': [
			'ts-jest',
			{
				useESM: true,
				tsconfig: '<rootDir>/tsconfig.test.json'
			}
		]
	}
}
