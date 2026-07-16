const { EventEmitter } = require('events');

jest.mock('../database', () => jest.fn());

const { handleChatStream } = require('../controllers/chatController');

describe('chat SSE controller', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('writes heartbeats while idle and clears the timer on disconnect', () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});

    const req = new EventEmitter();
    req.user = { id: 42 };
    const res = {
      destroyed: false,
      writableEnded: false,
      write: jest.fn(),
      writeHead: jest.fn()
    };

    handleChatStream(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive'
    }));
    expect(res.write).toHaveBeenCalledWith(':ok\n\n');

    jest.advanceTimersByTime(25_000);
    expect(res.write).toHaveBeenCalledWith(':heartbeat\n\n');

    req.emit('close');
    const writesAfterClose = res.write.mock.calls.length;
    jest.advanceTimersByTime(50_000);

    expect(res.write).toHaveBeenCalledTimes(writesAfterClose);
    expect(jest.getTimerCount()).toBe(0);
  });
});
