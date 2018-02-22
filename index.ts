import * as WebSocket from 'ws';
import EthWsClient from './src/eth-ws-client';
import logger from './src/logger';
import updateBlocks from './src/update-blocks';
import { Callback, Context, Handler } from 'aws-lambda';

const {
  RUN_TIME_LENGTH_SECONDS,
  WSS_NODE_URL = 'wss://mainnet.infura.io/ws'
} = process.env;

let msRuntime: number = (parseInt(RUN_TIME_LENGTH_SECONDS) || 120) * 1000;
if (isNaN(msRuntime)) {
  msRuntime = 120000;
}

export const start: Handler = (event: any, context: Context, cb: Callback) => {
  const ws = new WebSocket(WSS_NODE_URL);

  const client = new EthWsClient({ ws });

  const START_TIME = new Date().getTime();
  const runtime = () => (new Date().getTime()) - START_TIME;

  ws.on('open', async () => {
    const clientVersion = await client.web3_clientVersion();
    logger.info('client version', clientVersion);

    let locked = false;

    const interval = setInterval(() => {
      if (runtime() >= RUN_TIME_LENGTH_SECONDS) {
        context.done();
        clearInterval(interval);
        return;
      }

      if (locked) {
        return;
      }

      locked = true;

      updateBlocks(client)
        .then(
          () => {
            locked = false;
          }
        )
        .catch(
          err => {
            logger.error({ err }, 'unexpected error encountered');

            locked = false;
          }
        );
    }, 1000);


    ws.on('error', (err: Error) => {
      logger.fatal({ err }, 'websocket error');
      process.exit(1);
    });

    ws.on('close', (code: number, reason: string) => {
      logger.info({ code, reason }, 'websocket closed');
    });

    process.on('SIGINT', function () {
      process.exit(0);
    });

    process.on('exit', function () {
      logger.info('cleaning up resources');

      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'terminated by process');
      }

      clearInterval(interval);
    });
  });
};