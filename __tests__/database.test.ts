jest.mock('react-native-sqlite-storage', () => {
  const database = {
    executeSql: jest.fn((statement: string) => {
      if (statement === 'PRAGMA user_version') {
        return Promise.resolve([
          {rows: {length: 1, item: () => ({user_version: 3})}},
        ]);
      }
      if (statement.startsWith('SELECT * FROM recordings')) {
        return Promise.resolve([{rows: {length: 0, item: jest.fn()}}]);
      }
      return Promise.resolve([{rowsAffected: 0, rows: {length: 0, item: jest.fn()}}]);
    }),
    transaction: jest.fn(),
  };
  const sqlite = Object.create({
    enablePromise: jest.fn(),
    openDatabase: jest.fn().mockResolvedValue(database),
  });
  return sqlite;
});

import {enablePromise} from 'react-native-sqlite-storage';

import {listRecordings} from '../src/data/database';

it('enables the SQLite promise API and loads recordings', async () => {
  expect(enablePromise).toHaveBeenCalledWith(true);
  await expect(listRecordings()).resolves.toEqual([]);
});
