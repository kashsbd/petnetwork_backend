exports.getAllSubscriber = (socket) => {
    let data = [];
    //all socket ids who subscribe to /all_noties and /all_chats
    const all_clients = Object.keys(socket.connected);
    for (let each_socket_id of all_clients) {
        //get socket obj from socket id
        const each_socket = socket.connected[each_socket_id];
        //get owner id from socket.io query
        const owner_id = each_socket.handshake.query.ownerId;
        data.push({ each_socket, owner_id });
    }
    return data;
}


