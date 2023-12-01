import { app, shell, BrowserWindow, ipcMain } from 'electron'
import os from 'os'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from "electron-updater";
import { trackEvent, trackKombuchaEvent } from "./analytics"
import icon from '../../resources/icon.png?asset'
import ElectronLog from "electron-log"
import axios from "axios"
import fp from "find-free-port"
import { spawn, execFile, spawnSync } from "node:child_process"
import { existsSync } from 'fs'
import { JSONStorage } from "node-localstorage";
import log from 'electron-log/main';
import "./manifest-workbook"
import "./banner-image"
import './node-storage'
import "./main-process/native-ui/dialogs/open-file"

const sodaVersion = app.getVersion();
// If the version includes "beta", the app will not check for updates
const buildIsBeta = sodaVersion.includes("beta");
if (buildIsBeta) {
  log.info("This is a beta build. Updates will not be checked.");
}
autoUpdater.channel = buildIsBeta ? "beta" : "latest";
autoUpdater.logger = log;

// setup event tracking
global.trackEvent = trackEvent;
global.trackKombuchaEvent = trackKombuchaEvent;

// Optional, initialize the logger for any renderer process
log.initialize({ preload: true });
log.transports.console.level = false;
log.transports.file.level = "debug";


let nodeStorage = new JSONStorage(app.getPath("userData"))

// TODO: Move to ipcMain handler so renderer processes can talk to the nodestorage


// import "./appUtils"
console.log("Test up[date")


// TODO: move to a separate file that handles all the ipcMain handlers
ipcMain.handle('get-app-path', async (event, arg) => {
  if (arg) return app.getPath(arg)
  return app.getAppPath()
})

ipcMain.handle("get-port", () => {
  log.info("Renderer requested port: " + selectedPort);
  return selectedPort
});

ipcMain.handle("app-version", () => {
  return app.getVersion();
})

ipcMain.handle("set-nodestorage-key", (key, value) => {
  return nodeStorage.setItem(key, value);
})

ipcMain.handle("get-nodestorage-key", (key) => {
  return nodeStorage.getItem(key);
})

ipcMain.handle("relaunch-soda", () => {
  app.relaunch();
  app.exit();
})

ipcMain.handle("exit-soda", () => {
  app.exit();
})

// passing in the spreadsheet data to pass to a modal
// that will have a jspreadsheet for user edits
ipcMain.handle("spreadsheet", (event, spreadsheet) => {
  console.log("Spreadsheet invoked")
  const windowOptions = {
    minHeight: 450,
    width: 1120,
    height: 550,
    center: true,
    show: true,
    icon: __dirname + "/assets/menu-icon/soda_icon.png",
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      contextIsolation: false,
    },
    // modal: true,
    parent: mainWindow,
    closable: true,
  };
  let spreadSheetModal = new BrowserWindow(windowOptions);
  spreadSheetModal.on("close", (e) => {
    mainWindow.webContents.send("spreadsheet-reply", "");
    try {
      spreadSheetModal.destroy();
      // spreadSheetModal.close();
    } catch (e) {
      console.log(e);
    }
  });
  spreadSheetModal.loadFile("./sections/spreadSheetModal/spreadSheet.html");
  spreadSheetModal.once("ready-to-show", async () => {
    //display window when ready to show
    spreadSheetModal.show();
    //send data to child window
    spreadSheetModal.send("requested-spreadsheet", spreadsheet);
  });
  ipcMain.on("spreadsheet-results", async (ev, res) => {
    //send back spreadsheet data to main window
    mainWindow.webContents.send("spreadsheet-reply", res);
    //destroy window
    try {
      spreadSheetModal.destroy();
      // spreadSheetModal.close();
    } catch (e) {
      console.log(e);
    }
  });
})


// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
const PY_FLASK_DIST_FOLDER = "pyflaskdist";
const PY_FLASK_FOLDER = "../src/pyflask";
const PY_FLASK_MODULE = "app";
let PORT = 4242;
const portRange = 100;
let pyflaskProcess = null;
let selectedPort = null;
const kombuchaURL = "https://analytics-nine-ashen.vercel.app/api";
const localKombuchaURL = "http://localhost:3000/api";
const kombuchaServer = axios.create({
  baseURL: kombuchaURL,
  timeout: 0,
});
let updatechecked = false;



/**
 * Determine if the application is running from a packaged version or from a dev version.
 * The resources path is used for Linux and Mac builds and the app.getAppPath() is used for Windows builds.
 * @returns {boolean} True if the app is packaged, false if it is running from a dev version.
 */
const guessPackaged = () => {
  const windowsPath = join(__dirname, "..", PY_FLASK_DIST_FOLDER);
  ElectronLog.info("Windows path: " + windowsPath);
  const unixPath = join(process.resourcesPath, PY_FLASK_MODULE);
  if (process.platform === "darwin" || process.platform === "linux") {
    if (existsSync(unixPath)) {
      return true;
    } else {
      return false;
    }
  }
  if (process.platform === "win32") {
    if (existsSync(windowsPath)) {
      ElectronLog.info("App is packaged returning true [ Windows ]")

      return true;
    } else {
      return false;
    }
  }
};

/**
 * Get the system path to the api server script.
 * The script is located in the resources folder for packaged Linux and Mac builds and in the app.getAppPath() for Windows builds.
 * It is relative to the main.js file directory when in dev mode.
 * @returns {string} The path to the api server script that needs to be executed to start the Python server
 */
const getScriptPath = () => {
  if (!guessPackaged()) {
    ElectronLog.info("App is not packaged returning path: ");
    ElectronLog.info(join(__dirname, "..", PY_FLASK_FOLDER, PY_FLASK_MODULE + ".py"));
    return join(__dirname, "..", PY_FLASK_FOLDER, PY_FLASK_MODULE + ".py");
  }
  if (process.platform === "win32") {
    const winPath = join(__dirname, PY_FLASK_DIST_FOLDER, PY_FLASK_MODULE + ".exe");
    ElectronLog.info("App is packaged [Windows]; Path to server executable: " + winPath);
    return winPath;
  } else {
    const unixPath = join(process.resourcesPath, PY_FLASK_MODULE);
    ElectronLog.info("App is packaged [ Unix ]; Path to server executable: " + unixPath);
    return unixPath;
  }
};

const killAllPreviousProcesses = async () => {
  console.log("Killing all previous processes");
  // kill all previous python processes that could be running.
  let promisesArray = [];
  let endRange = PORT + portRange;
  // create a loop of 100
  for (let currentPort = PORT; currentPort <= endRange; currentPort++) {
    promisesArray.push(
      axios.get(`http://127.0.0.1:${currentPort}/sodaforsparc_server_shutdown`, {})
    );
  }
  // wait for all the promises to resolve
  await Promise.allSettled(promisesArray);
};

const selectPort = () => {
  return PORT;
};

const createPyProc = async () => {
  let script = getScriptPath();
  ElectronLog.info(`Path to server executable: ${script}`);
  let port = "" + selectPort();
  // await killAllPreviousProcesses();
  if (existsSync(script)) {
    ElectronLog.info("Server exists at specified location", script);
  } else {
    ElectronLog.info("Server doesn't exist at specified location");
  }
  fp(PORT, PORT + portRange)
    .then(([freePort]) => {
      let port = freePort;
      if (guessPackaged()) {
        ElectronLog.info("Application is packaged")
        // Store the stdout and stederr in a string to ElectronLog later
        let sessionServerOutput = "";
        ElectronLog.info(`Starting server on port ${port}`)
        pyflaskProcess = execFile(script, [port], (error, stdout, stderr) => {
          if (error) {
            console.error(error)
            ElectronLog.error(error);
            // console.error(stderr)
            throw error;
          }
          console.log(stdout);
        });
        // ElectronLog the stdout and stderr
        pyflaskProcess.stdout.on("data", (data) => {
          const logOutput = `[pyflaskProcess output] ${data.toString()}`;
          sessionServerOutput += `${logOutput}`;
        });
        pyflaskProcess.stderr.on("data", (data) => {
          const logOutput = `[pyflaskProcess stderr] ${data.toString()}`;
          sessionServerOutput += `${logOutput}`;
        });
        // On close, ElectronLog the outputs and the exit code
        pyflaskProcess.on("close", (code) => {
          ElectronLog.info(`child process exited with code ${code}`);
          ElectronLog.info("Server output during session found below:");
          ElectronLog.info(sessionServerOutput);
        });
      } else {
        ElectronLog.info("Application is not packaged")
        // update code here
        pyflaskProcess = spawn("python", [script, port], {
          stdio: "ignore",
        });

        pyflaskProcess.on('data', function () {
          console.log('pyflaskProcess successfully started');
        });

        pyflaskProcess.on('error', function (err) {
          console.error('Failed to start pyflaskProcess:', err);
        });

        pyflaskProcess.on('close', function (err) {
          console.error('Failed to start pyflaskProcess:', err);
        });
      }
      if (pyflaskProcess != null) {
        console.log("child process success on port " + port);
        ElectronLog.info("child process success on port " + port);
      } else {
        console.error("child process failed to start on port" + port);
      }
      selectedPort = port;
    })
    .catch((err) => {
      ElectronLog.error("Error starting the python server");
      console.log(err);
    });
};

const exitPyProc = async () => {
  log.info("Killing python server process");
  // Windows does not properly shut off the python server process. This ensures it is killed.
  const killPythonProcess = () => {
    // kill pyproc with command line
    const cmd = spawnSync("taskkill", [
      "/pid",
      pyflaskProcess.pid,
      "/f",
      "/t",
    ]);
  };
  console.log("Killing the process");
  await killAllPreviousProcesses();
  // check if the platform is Windows
  if (process.platform === "win32") {
    if (pyflaskProcess != null) {
      killPythonProcess();
    }
    pyflaskProcess = null;
    PORT = null;
    return;
  }
  // kill signal to pyProc
  if (pyflaskProcess != null) {
    pyflaskProcess.kill();
    pyflaskProcess = null;
  }
  PORT = null;
};


// analytics function
// Sends user information to Kombucha server
const sendUserAnalytics = () => {
  // Retrieve the userId and if it doesn't exist, create a new uuid
  let token;
  let userCreated;
  try {
    token = nodeStorage.getItem("kombuchaToken");
  } catch (e) {
    token = null;
  }
  try {
    userCreated = nodeStorage.getItem("kombuchaUserCreated");
  } catch (e) {
    userCreated = null;
  }
  if (token === null || userCreated === null) {
    // send empty object for new users
    kombuchaServer
      .post("meta/users", {})
      .then((res) => {
        // Save the user token from the server
        nodeStorage.setItem("kombuchaToken", res.data.token);
        nodeStorage.setItem("userId", res.data.uid);
        nodeStorage.setItem("kombuchaUserCreated", true);
      })
      .catch((err) => {
        console.error(err);
      });
  }
};


// single app instance code
// Make this app a single instance app.
const gotTheLock = app.requestSingleInstanceLock();
function makeSingleInstance() {
  if (process.mas) {
    return;
  }
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on("second-instance", () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
      }
    });
  }
}


// setup main processes for the app ( starting spsash screen, starting the server, what to do on all windows closed, etc )
const initialize = () => {
  sendUserAnalytics();
  makeSingleInstance();

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.whenReady().then(async () => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    const splashScreen = new BrowserWindow({
      width: 220,
      height: 190,
      frame: false,
      icon: __dirname + "/assets/menu-icon/soda_icon.png",
      alwaysOnTop: true,
      transparent: true,
    })

    // TODO: Add dev check for this path
    splashScreen.loadURL(process.env['ELECTRON_RENDERER_URL'] +  "/splash/splash-screen.html")


    splashScreen.once("ready-to-show", () => {
      splashScreen.show();
    })

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    let mainWindow = null;
    createWindow()

    mainWindow.webContents.once("dom-ready", () => {
      setTimeout(function () {
        splashScreen.close();
        //mainWindow.maximize();
        mainWindow.show();
        // createWindow();
        var first_launch = nodeStorage.getItem("auto_update_launch");
        if (first_launch == true) {
          nodeStorage.setItem("auto_update_launch", false);
          mainWindow.reload();
          mainWindow.focus();
        }

        // start_pre_flight_checks();
        if (!buildIsBeta) {
          autoUpdater.checkForUpdatesAndNotify();
        }
        updatechecked = true;
      }, 6000);
    })

    // spawn the python server 
    createPyProc()

    // show the splash screen


    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    // track app launch at Kombucha analytics server
    // trackKombuchaEvent(
    //   kombuchaEnums.Category.STARTUP,
    //   kombuchaEnums.Action.APP_LAUNCHED,
    //   kombuchaEnums.Label.VERSION,
    //   kombuchaEnums.Status.SUCCESS,
    //   {
    //     value: app.getVersion(),
    //   }
    // );

    // trackKombuchaEvent(
    //   kombuchaEnums.Category.STARTUP,
    //   kombuchaEnums.Action.APP_LAUNCHED,
    //   kombuchaEnums.Label.OS,
    //   kombuchaEnums.Status.SUCCESS,
    //   {
    //     value: os.platform() + "-" + os.release(),
    //   }
    // );

    trackEvent("Success", "App Launched - OS", os.platform() + "-" + os.release());
    trackEvent("Success", "App Launched - SODA", app.getVersion());


    function createWindow() {
      // Create the browser window.
      mainWindow = new BrowserWindow({
        width: 900,
        height: 670,
        show: false,
        nodeIntegration: true,
        autoHideMenuBar: true,
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false,
          contextIsolation: true,
          webSecurity: false // TODO: set to true and make the Python server a proxy to add CORS headers
        }
      })

      mainWindow.webContents.on('new-window', (event, url) => {
        event.preventDefault()
        shell.openExternal(url)
      })

      mainWindow.webContents.once("dom-ready", () => {
        if (updatechecked == false && !buildIsBeta) {
          autoUpdater.checkForUpdatesAndNotify();
        }
      })

      mainWindow.on("close", async (e) => {
        if (!user_restart_confirmed) {
          if (app.showExitPrompt) {
            e.preventDefault(); // Prevents the window from closing
            dialog
              .showMessageBox(BrowserWindow.getFocusedWindow(), {
                type: "question",
                buttons: ["Yes", "No"],
                title: "Confirm",
                message: "Any running process will be stopped. Are you sure you want to quit?",
              })
              .then(async (responseObject) => {
                let { response } = responseObject;
                if (response === 0) {
                  // Runs the following if 'Yes' is clicked
                  await exitPyProc();
                  quit_app();
                }
              });
          }
        } else {
          // if this flag is true SODA for SPARC will run through the auto update launch workflow
          nodeStorage.setItem("auto_update_launch", true);
          // after an autoupdate we want to display announcements at launch
          nodeStorage.setItem("launch_announcements", true);
          await exitPyProc();
          app.exit();
        }
      });

      const quit_app = () => {
        // TODO: CHeck if an update was downloaded here and reset the launchAnnouncements and freshLaunch flags to true [ HERE ]
        app.showExitPrompt = false;
        mainWindow.close();
        /// feedback form iframe prevents closing gracefully
        /// so force close
        if (!mainWindow.closed) {
          mainWindow.destroy();
        }
      };

      mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
      })

      // HMR for renderer base on electron-vite cli.
      // Load the remote URL for development or the local html file for production.
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
      } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
      }



    }
  })

  // Quit when all windows are closed, except on macOS. There, it's common
  // for applications and their menu bar to stay active until the user quits
  // explicitly with Cmd + Q.
  app.on('window-all-closed', async () => {
    await exitPyProc()
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on("will-quit", () => {
    app.quit();
  });
}

initialize()













