module.exports = {
  presets: [
    [
      'module:@react-native/babel-preset',
      {
        unstable_transformProfile: 'hermes-stable',
      },
    ],
  ],
  plugins: ['@babel/plugin-transform-export-namespace-from'],
}
