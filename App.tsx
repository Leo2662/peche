import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScoreScreen } from './src/screens/ScoreScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <ScoreScreen />
    </SafeAreaProvider>
  );
}
