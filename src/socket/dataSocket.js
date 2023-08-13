const Io = require('socket.io');
const SocketUser = require('../model/socketUserModel');



let ioSocket = null;
let socketDataType = {
    journal : "journal",
    vasJournal : "vas-journal",
    terminalHealth : "callhome"
}

/**
 * setup io socket
 * @param {Object} server socket server object
 */
const setupIo = async(server)=>{

    ioSocket = Io(server);

    ioSocket.use(async (socket, next) => {
        let token = socket.handshake.query.token;

        if (!token) {
            return ioSocket.to(socket.id).emit('message', "Invalid Auth Token");
        };

        let connector = await SocketUser.getSocket(token);

        if (!connector) return ioSocket.to(socket.id).emit('message', "Invalid Auth Token");
        
        await SocketUser.updateSocket(token, socket.id, true);

        socket.on('disconnect',async(socket)=>{

            await SocketUser.updateSocket(token,socket.id,false);
    
            console.warn(`IO Disconnection ${socket.id} at ${new Date().toString()}`);
    
        });

        return next();
    });

    ioSocket.on('connection',(socket)=>{

        console.log(`IO connection from ${socket.id} at ${new Date().toString()}`);

        ioSocket.to(socket.id).emit('message',"Connected!!");
        sendSocketNotification('data', Object.keys(socketDataType).map(r=>{ return socketDataType[r] } ));
    });

};

const sendSocketNotification = async (event,data) => {

    let connected = await SocketUser.getConnected();
    if (connected.length <= 0) return;

    connected.forEach(soc => {
        try {
            ioSocket.to(soc.socketId).emit(event, data);
            console.log(`sending data, socket : ${soc.token} at ${new Date().toString()}`);

        } catch (error) {
            console.error(`error sending data, socket : ${soc.token} at ${new Date().toString()} error ${error.toString()}`);
        }
    });

};




module.exports = {setupIo, sendSocketNotification, socketDataType};
