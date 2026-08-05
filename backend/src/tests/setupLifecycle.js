const TEST_CONNECTIONS = Symbol.for('fitlife.testDatabaseConnections');

afterAll(async () => {
  const connections = process[TEST_CONNECTIONS];
  if (!connections?.size) return;

  await Promise.allSettled([...connections].map(connection => connection.destroy()));
  connections.clear();
});
