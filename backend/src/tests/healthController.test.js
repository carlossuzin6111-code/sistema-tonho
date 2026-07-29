jest.mock('../database', () => ({
  ready: Promise.resolve(),
  raw: jest.fn(),
  migrate: { list: jest.fn() }
}));

const db = require('../database');
const { live, ready } = require('../controllers/healthController');

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('health probes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.raw.mockResolvedValue([{ one: 1 }]);
    db.migrate.list.mockResolvedValue([[], []]);
  });

  test('liveness does not touch the database', async () => {
    const res = response();

    await live({}, res);

    expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
    expect(db.raw).not.toHaveBeenCalled();
    expect(db.migrate.list).not.toHaveBeenCalled();
  });

  test('readiness reports unavailable when migrations are pending', async () => {
    db.migrate.list.mockResolvedValue([[], ['202607300001_future.js']]);
    const res = response();

    await ready({}, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ status: 'unavailable' });
  });

  test('readiness reports unavailable when the database check fails', async () => {
    db.raw.mockRejectedValue(new Error('database unavailable'));
    const res = response();

    await ready({}, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ status: 'unavailable' });
  });
});
