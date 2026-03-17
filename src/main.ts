import './instrument';
import EnvVars from './utils/env';
import server from './app';

/******************************************************************************
                                Constants
******************************************************************************/

const SERVER_START_MESSAGE =
  'Express server started on port: ' + EnvVars.Port.toString();

/******************************************************************************
                                  Run
******************************************************************************/

// Start the server
server.listen(EnvVars.Port, (err?: Error) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log(SERVER_START_MESSAGE);
  }
});
