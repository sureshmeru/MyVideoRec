import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';

import {ActionButton} from '../src/components/UI';

it('exposes an accessible action and invokes its handler', () => {
  const onPress = jest.fn();
  const screen = render(<ActionButton label="Start recording" onPress={onPress} />);

  fireEvent.press(screen.getByRole('button', {name: 'Start recording'}));

  expect(onPress).toHaveBeenCalledTimes(1);
});
