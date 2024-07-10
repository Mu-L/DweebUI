import { Readable } from 'stream';
import { readFileSync } from 'fs';
import { currentLoad, mem, networkStats, fsSize, dockerContainerStats } from 'systeminformation';
import { Op } from 'sequelize';

import Docker from 'dockerode';

import { Permission, User, ServerSettings } from '../database/models.js';
import { docker, docker2, docker3, docker4, host_list, host2_list, host3_list, host4_list } from '../server.js';

let [ hidden, alert, newCards, stats ] = [ '', '', '', {} ];
let logString = '';

// async function hostInfo(host) {
//     let info = await ServerSettings.findOne({ where: {key: host}});
//     try {
//         if (info.value != 'off' && info.value != '') {
//             let values = info.value.split(',');
//             return { tag: values[0], ip: values[1], port: values[2] };
//         }
//     } catch {
//         // console.log(`${host}: No Value Set`);
//     }
// }


export const Dashboard = async (req, res) => {

    console.log(`Viewing Host: ${req.params.host}`);

    let { link1, link2, link3, link4, link5, link6, link7, link8, link9 } = ['', '', '', '', '', '', '', '', ''];

    // let host2 = await hostInfo('host2');
    // let host3 = await hostInfo('host3');
    // let host4 = await hostInfo('host4');

    if (docker2 || docker3 || docker4) {
        link1 = `<a href="/1/dashboard" class="btn text-green" name="host">
                    Host 1
                </a>`;
        link5 = `<a href="/0/dashboard" class="btn text-green" name="hosts">
                    All
                </a>`;
    }
    if (docker2) { link2 = `<a href="/2/dashboard" class="btn text-green" name="host2">
                    Host2
                </a>`;
    }
    if (docker3) { link3 = `<a href="/3/dashboard" class="btn text-green" name="host3">
                    Host3
                </a>`;
    }
    if (docker4) { link4 = `<a href="/4/dashboard" class="btn text-green" name="host4">
                    Host4
                </a>`;
    }

    
    res.render("dashboard", {
        username: req.session.username,
        avatar: req.session.username.charAt(0).toUpperCase(),
        role: req.session.role,
        alert: req.session.alert,
        link1: link1,
        link2: link2,
        link3: link3,
        link4: link4,
        link5: link5,
        link6: '',
        link7: '',
        link8: '',
        link9: '',
    });
}


export const ContainerAction = async (req, res) => {
    // Assign values
    let container_name = req.header('hx-trigger-name');
    let container_id = req.header('hx-trigger');
    let action = req.params.action;


    if (container_id == 'reset') { 
        console.log('Resetting view'); 
        await Permission.update({ hide: false }, { where: { userID: req.session.userID } });
        res.send('ok'); 
        return;
    }

    // Inspect the container
    let container = docker.getContainer(container_id);
    let containerInfo = await container.inspect();
    let state = containerInfo.State.Status;

    console.log(`Container: ${container_name} ID: ${container_id} State: ${state} Action: ${action}`);

    function status (state) {
        return(`<span class="text-yellow align-items-center lh-1"><svg xmlns="http://www.w3.org/2000/svg" class="icon-tabler icon-tabler-point-filled" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"> <path stroke="none" d="M0 0h24v24H0z" fill="none"></path> <path d="M12 7a5 5 0 1 1 -4.995 5.217l-.005 -.217l.005 -.217a5 5 0 0 1 4.995 -4.783z" stroke-width="0" fill="currentColor"></path></svg>
                        ${state}
                </span>`);
    }

    if ((action == 'start') && (state == 'exited')) {
        await container.start();
        res.send(status('starting'));
    } else if ((action == 'start') && (state == 'paused')) {
        await container.unpause();
        res.send(status('starting'));
    } else if ((action == 'stop') && (state != 'exited')) {
        await container.stop();
        res.send(status('stopping'));
    } else if ((action == 'pause') && (state == 'paused')) {
        await container.unpause();
        res.send(status('starting'));
    }   else if ((action == 'pause') && (state == 'running')) {
        await container.pause();
        res.send(status('pausing'));
    } else if (action == 'restart') {
        await container.restart();
        res.send(status('restarting'));
    } else if (action == 'hide') {
        let exists = await Permission.findOne({ where: { containerID: container_id, userID: req.session.userID }});
        if (!exists) { const newPermission = await Permission.create({ containerName: container_name, containerID: container_id, username: req.session.username, userID: req.session.userID, hide: true }); }
        else { exists.update({ hide: true }); }
        // Array of hidden containers
        hidden = await Permission.findAll({ where: { userID: req.session.userID, hide: true}}, { attributes: ['containerID'] });
        // Map the container IDs
        hidden = hidden.map((container) => container.containerID);
        console.log(hidden);
        res.send("ok");
    }
    
}

export const DashboardAction = async (req, res) => {
    let name = req.header('hx-trigger-name');
    let value = req.header('hx-trigger');
    let action = req.params.action;
    let modal = '';

    // console.log(`Action: ${action} Name: ${name} Value: ${value}`);

    if (req.body.search) { 
        console.log(req.body.search);
        res.send('search');
        return;
    }
    
    switch (action) {
        // case 'checkhost':
        //     let link = '';
        //     let host_info = await hostInfo(name);
        //     try {
        //         var docker2 = new Docker({ protocol: 'http', host: host_info.ip, port: host_info.port });
        //         let containers = await docker2.listContainers({ all: true });
        //         link = `<button class="btn text-green" name="host2">
        //                     ${host_info.tag}
        //                 </button>`;
        //     } catch {
        //         console.log(`Error connecting to ${name}`);
        //         link = `<button class="btn text-red" name="host2">
        //                     ${host_info.tag}
        //                 </button>`;
        //     }
        //     res.send(link);
        // return;
        case 'permissions': // (Action = Selecting 'Permissions' from the dropdown) Creates the permissions modal 
            // To capitalize the title
            let title = name.charAt(0).toUpperCase() + name.slice(1);
            // Empty the permissions list
            let permissions_list = '';
            // Get the container ID
            let container = docker.getContainer(name);
            let containerInfo = await container.inspect();
            let container_id = containerInfo.Id;
            // Get the body of the permissions modal
            let permissions_modal = readFileSync('./views/modals/permissions.html', 'utf8');
            // Replace the title and container name in the modal
            permissions_modal = permissions_modal.replace(/PermissionsTitle/g, title);
            permissions_modal = permissions_modal.replace(/PermissionsContainer/g, name);
            permissions_modal = permissions_modal.replace(/ContainerID/g, container_id);
            // Get a list of all users
            let users = await User.findAll({ attributes: ['username', 'userID']});
            // Loop through each user to check what permissions they have
            for (let i = 0; i < users.length; i++) {
                // Get the user_permissions form
                let user_permissions = readFileSync('./views/partials/user_permissions.html', 'utf8');
                // Check if the user has any permissions for the container
                let exists = await Permission.findOne({ where: { containerID: container_id, userID: users[i].userID }});
                // Create an entry if one doesn't exist
                if (!exists) { const newPermission = await Permission.create({ containerName: name, containerID: container_id, username: users[i].username, userID: users[i].userID }); }
                // Get the permissions for the user
                let permissions = await Permission.findOne({ where: { containerID: container_id, userID: users[i].userID }});
                // Fill in the form values
                if (permissions.uninstall == true) { user_permissions = user_permissions.replace(/data-UninstallCheck/g, 'checked'); }
                if (permissions.edit == true) { user_permissions = user_permissions.replace(/data-EditCheck/g, 'checked'); }
                if (permissions.upgrade == true) { user_permissions = user_permissions.replace(/data-UpgradeCheck/g, 'checked'); }
                if (permissions.start == true) { user_permissions = user_permissions.replace(/data-StartCheck/g, 'checked'); }
                if (permissions.stop == true) { user_permissions = user_permissions.replace(/data-StopCheck/g, 'checked'); }
                if (permissions.pause == true) { user_permissions = user_permissions.replace(/data-PauseCheck/g, 'checked'); }
                if (permissions.restart == true) { user_permissions = user_permissions.replace(/data-RestartCheck/g, 'checked'); }
                if (permissions.logs == true) { user_permissions = user_permissions.replace(/data-LogsCheck/g, 'checked'); }
                if (permissions.view == true) { user_permissions = user_permissions.replace(/data-ViewCheck/g, 'checked'); }
                user_permissions = user_permissions.replace(/EntryNumber/g, i);
                user_permissions = user_permissions.replace(/EntryNumber/g, i);
                user_permissions = user_permissions.replace(/EntryNumber/g, i);
                user_permissions = user_permissions.replace(/PermissionsUsername/g, users[i].username);
                user_permissions = user_permissions.replace(/PermissionsUsername/g, users[i].username);
                user_permissions = user_permissions.replace(/PermissionsUsername/g, users[i].username);
                user_permissions = user_permissions.replace(/PermissionsContainer/g, name);
                user_permissions = user_permissions.replace(/PermissionsContainer/g, name);
                user_permissions = user_permissions.replace(/PermissionsContainer/g, name);
                user_permissions = user_permissions.replace(/PermissionsUserID/g, users[i].userID);
                user_permissions = user_permissions.replace(/PermissionsID/g, container_id);
                // Add the user entry to the permissions list
                permissions_list += user_permissions;
            }
            // Insert the user list into the permissions modal
            permissions_modal = permissions_modal.replace(/PermissionsList/g, permissions_list);
            // Send the permissions modal
            res.send(permissions_modal);
            return;
        case 'uninstall':
            modal = readFileSync('./views/modals/uninstall.html', 'utf8');
            modal = modal.replace(/AppName/g, name);
            res.send(modal);
            return;
        case 'details':
            modal = readFileSync('./views/modals/details.html', 'utf8');
            let details = await containerInfo(name);

            modal = modal.replace(/AppName/g, details.name);
            modal = modal.replace(/AppImage/g, details.image);

            for (let i = 0; i <= 6; i++) {
                modal = modal.replaceAll(`Port${i}Check`, details.ports[i]?.check || '');
                modal = modal.replaceAll(`Port${i}External`, details.ports[i]?.external || '');
                modal = modal.replaceAll(`Port${i}Internal`, details.ports[i]?.internal || '');
                modal = modal.replaceAll(`Port${i}Protocol`, details.ports[i]?.protocol || '');
            }

            for (let i = 0; i <= 6; i++) {
                modal = modal.replaceAll(`Vol${i}Source`, details.volumes[i]?.Source || '');
                modal = modal.replaceAll(`Vol${i}Destination`, details.volumes[i]?.Destination || '');
                modal = modal.replaceAll(`Vol${i}RW`, details.volumes[i]?.RW || '');
            }


            for (let i = 0; i <= 19; i++) {
                modal = modal.replaceAll(`Label${i}Key`, Object.keys(details.labels)[i] || '');
                modal = modal.replaceAll(`Label${i}Value`, Object.values(details.labels)[i] || '');
            }

            // console.log(details.env);
            for (let i = 0; i <= 19; i++) {
                modal = modal.replaceAll(`Env${i}Key`, details.env[i]?.split('=')[0] || '');
                modal = modal.replaceAll(`Env${i}Value`, details.env[i]?.split('=')[1] || '');
            }

            res.send(modal);
            return;
        case 'updates':
            res.send(newCards);
            newCards = '';
            return;
        case 'card':
            // Check which cards the user has permissions for
            await userCards(req.session);
            // Remove the container if it isn't in the user's list
            if (!req.session.container_list.find(c => c.container === name)) {
                res.send('');
                return;
            } else {
                // Get the container information and send the updated card
                let details = await containerInfo(value);
                let card = await createCard(details);
                res.send(card);
                return;
            }
        case 'logs':
            logString = '';
            let options = { follow: false, stdout: true, stderr: false, timestamps: true };
            console.log(`Getting logs for ${name}`);
            docker.getContainer(name).logs(options, function (err, stream) {
                if (err) { console.log(`some error getting logs`); return; }
                const readableStream = Readable.from(stream);
                readableStream.on('data', function (chunk) {
                    logString += chunk.toString('utf8');
                });
                readableStream.on('end', function () {
                    res.send(`<pre>${logString}</pre>`);
                });
            });
            return;
        case 'alert':
            req.session.alert = '';
            res.send('');
            return;
    }
}

async function containerInfo (containerID) {
    // get the container info
    let container = docker.getContainer(containerID);
    let info = await container.inspect();
    let image = info.Config.Image;
    let container_id = info.Id;
    // grab the service name from the end of the image name
    let service = image.split('/').pop();
    // remove the tag from the service name if it exists
    try { service = service.split(':')[0]; } catch {}
    let ports_list = [];
    let external = 0;
    let internal = 0;
    
    try {
        for (const [key, value] of Object.entries(info.HostConfig.PortBindings)) {
            let ports = {
                check: 'checked',
                external: value[0].HostPort,
                internal: key.split('/')[0],
                protocol: key.split('/')[1]
            }
            ports_list.push(ports);
        }
    } catch {}
    try {
        external = ports_list[0].external;
        internal = ports_list[0].internal;
    } catch {}

    let details = {
        name: info.Name.slice(1),
        image: image,
        service: service,
        containerID: container_id,
        state: info.State.Status,
        external_port: external,
        internal_port: internal,
        ports: ports_list,
        volumes: info.Mounts,
        env: info.Config.Env,
        labels: info.Config.Labels,
        link: 'localhost',
    }
    return details;
}

async function createCard (details) {
    let shortname = details.name.slice(0, 10) + '...';
    let trigger = 'data-hx-trigger="load, every 3s"';
    let state = details.state;
    let card  = readFileSync('./views/partials/containerFull.html', 'utf8');

    let app_icon = (details.labels['com.docker.compose.service']);

    let links = await ServerSettings.findOne({ where: {key: 'links'}});
    if (!links) { links = { value: 'localhost' }; }

    let state_color = '';
    switch (state) {
        case 'running':
            state_color = 'green';
            break;
        case 'exited':
            state = 'stopped';
            state_color = 'red';
            trigger = 'data-hx-trigger="load"';
            break;
        case 'paused':
            state_color = 'orange';
            trigger = 'data-hx-trigger="load"';
            break;
        case 'installing':
            state_color = 'blue';
            trigger = 'data-hx-trigger="load"';
            break;
    }
    // if (name.startsWith('dweebui')) { disable = 'disabled=""'; }

    card = card.replace(/AppName/g, details.name);
    card = card.replace(/AppID/g, details.containerID);
    card = card.replace(/AppShortName/g, shortname);
    card = card.replace(/AppIcon/g, app_icon);
    card = card.replace(/AppState/g, state);
    card = card.replace(/StateColor/g, state_color);
    card = card.replace(/AppLink/g, links.value);
    card = card.replace(/ExternalPort/g, details.external_port);
    card = card.replace(/InternalPort/g, details.internal_port);
    card = card.replace(/ChartName/g, details.name.replace(/-/g, ''));
    card = card.replace(/AppNameState/g, `${details.name}State`);
    card = card.replace(/data-trigger=""/, trigger);
    return card;
}

// Creates a list of containers that the user should be able to see.
async function userCards (session) {
    // Create an empty container list.
    session.container_list = [];
    // Check what containers the user has hidden.
    let hidden = await Permission.findAll({ where: { userID: session.userID, hide: true }, attributes: ['containerID'], raw: true });
    // Check which containers the user has permissions for.
    let visable = await Permission.findAll({ where: { userID: session.userID, [Op.or]: [{ uninstall: true }, { edit: true }, { upgrade: true }, { start: true }, { stop: true }, { pause: true }, { restart: true }, { logs: true }, { view: true }] }, attributes: ['containerID'], raw: true});
    // Get a list of all the containers.
    let containers = await docker.listContainers({ all: true });
    // Loop through the list of containers.
    for (let i = 0; i < containers.length; i++) {
        // Get the container ID.
        let containerID = containers[i].Id;
        // Skip the container if it's ID is in the hidden list.
        if (hidden.includes(containerID)) { console.log('skipped hidden container'); continue; }
        // If the user is admin and they don't have it hidden, add it to the list.
        if (session.role == 'admin') { session.container_list.push({ container: containerID, state: containers[i].State }); }
        // Add the container if it's ID is in the visable list.
        else if (visable.includes(containerID)){ session.container_list.push({ container: containerID, state: containers[i].State }); }
    }
    // Create the lists if they don't exist.
    if (!session.sent_list) { session.sent_list = []; }
    if (!session.update_list) { session.update_list = []; }
    if (!session.new_cards) { session.new_cards = []; }
}

async function updateDashboard (session) {
    // Get the list of containers and the list of containers that have been sent.
    let container_list = session.container_list;
    let sent_list = session.sent_list;
    session.new_cards = [];
    session.update_list = [];
    // Loop through the containers list
    container_list.forEach(info => {
        // Get the containerID and state
        let { container, state } = info;
        // Check if the container is in the sent list
        let sent = sent_list.find(c => c.container === container);
        // If it's not in the sent list, add it to the new cards list.
        if (!sent) { session.new_cards.push(container);}
        // If it is in the sent list, check if the state has changed.
        else if (sent.state !== state) { session.update_list.push(container); }
    });
    // Loop through the sent list to see if any containers have been removed
    sent_list.forEach(info => {
        let { container } = info;
        let exists = container_list.find(c => c.container === container);
        if (!exists) { session.update_list.push(container); }
    });
}

// HTMX server-side events
export const SSE = async (req, res) => {
    // Set the headers
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    // Check for container changes every 500ms
    let eventCheck = setInterval(async () => {
        await userCards(req.session);
        // check if the cards displayed are the same as what's in the session
        if ((JSON.stringify(req.session.container_list) === JSON.stringify(req.session.sent_list))) { return; }
        await updateDashboard(req.session); 

        for (let i = 0; i < req.session.new_cards.length; i++) {
            let details = await containerInfo(req.session.new_cards[i]);
            let card = await createCard(details);
            newCards += card;
            req.session.alert = '';
        }
        for (let i = 0; i < req.session.update_list.length; i++) {
            res.write(`event: ${req.session.update_list[i]}\n`);
            res.write(`data: 'update cards'\n\n`);
        }
        res.write(`event: update\n`);
        res.write(`data: 'update cards'\n\n`);
        req.session.sent_list = req.session.container_list.slice();
    }, 500);
    req.on('close', () => {
        clearInterval(eventCheck);
    });
};

// Server metrics (CPU, RAM, TX, RX, DISK)
export const Stats = async (req, res) => {
    let name = req.header('hx-trigger-name');
    let color = req.header('hx-trigger');
    let value = 0;
    switch (name) {
        case 'CPU': 
            await currentLoad().then(data => { value = Math.round(data.currentLoad); });
            break;
        case 'RAM': 
            await mem().then(data => { value = Math.round((data.active / data.total) * 100); });
            break;
        case 'NET':
            let [down, up, percent] = [0, 0, 0];
            await networkStats().then(data => { down = Math.round(data[0].rx_bytes / (1024 * 1024)); up = Math.round(data[0].tx_bytes / (1024 * 1024)); percent = Math.round((down / 1000) * 100); });
            let net = `<div class="font-weight-medium"><label class="cpu-text mb-1">Down:${down}MB  Up:${up}MB</label></div>
                        <div class="cpu-bar meter animate ${color}"><span style="width:20%"><span></span></span></div>`;           
            res.send(net);
            return;
        case 'DISK':
            await fsSize().then(data => { value = data[0].use; });
            break;
    }
    let info = `<div class="font-weight-medium"> <label class="cpu-text mb-1">${name} ${value}%</label></div>
                <div class="cpu-bar meter animate ${color}"><span style="width:${value}%"><span></span></span></div>`;
    res.send(info);
}

// Imported by utils/install.js
export async function addAlert (session, type, message) {
    session.alert = `<div class="alert alert-${type} alert-dismissible py-2 mb-0" role="alert" id="alert">
                        <div class="d-flex">
                            <div class="spinner-border text-info nav-link">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                            <div>
                              ${message}
                            </div>
                        </div>
                        <button class="btn-close" data-hx-post="/dashboard/alert" data-hx-trigger="click" data-hx-target="#alert" data-hx-swap="outerHTML" style="padding-top: 0.5rem;"></button>
                    </div>`;
}

export const UpdatePermissions = async (req, res) => {
    let { userID, container, containerID, reset_permissions } = req.body;
    let id = req.header('hx-trigger');

    console.log(`User: ${userID} Container: ${container} ContainerID: ${containerID} Reset: ${reset_permissions}`);

    if (reset_permissions) {
        await Permission.update({ uninstall: false, edit: false, upgrade: false, start: false, stop: false, pause: false, restart: false, logs: false, view: false }, { where: { containerID: containerID} });
        return;
    }
    await Permission.update({ uninstall: false, edit: false, upgrade: false, start: false, stop: false, pause: false, restart: false, logs: false, view: false}, { where: { containerID: containerID, userID: userID } });
    Object.keys(req.body).forEach(async function(key) {
        if (key != 'user' && key != 'container') {
            let permissions = req.body[key];
            if (permissions.includes('uninstall')) { await Permission.update({ uninstall: true }, { where: { containerID: containerID, userID: userID}}); }  
            if (permissions.includes('edit')) { await Permission.update({ edit: true }, { where: { containerID: containerID, userID: userID}}); }   
            if (permissions.includes('upgrade')) { await Permission.update({ upgrade: true }, { where: { containerID: containerID, userID: userID}}); }   
            if (permissions.includes('start')) { await Permission.update({ start: true }, { where: { containerID: containerID, userID: userID}}); }   
            if (permissions.includes('stop')) { await Permission.update({ stop: true }, { where: { containerID: containerID, userID: userID}}); }   
            if (permissions.includes('pause')) { await Permission.update({ pause: true }, { where: { containerID: containerID, userID: userID}}); }   
            if (permissions.includes('restart')) { await Permission.update({ restart: true }, { where: { containerID: containerID, userID: userID}}); }   
            if (permissions.includes('logs')) { await Permission.update({ logs: true }, { where: { containerID: containerID, userID: userID}}); }
            if (permissions.includes('view')) { await Permission.update({ view: true }, { where: { containerID: containerID, userID: userID}}); }
        }  
    });
    if (id == 'submit') {
        res.send('<button class="btn" type="button" id="confirmed" hx-post="/updatePermissions" hx-swap="outerHTML" hx-trigger="load delay:2s">Update ✔️</button>');
        return;
    } else if (id == 'confirmed') {
        res.send('<button class="btn" type="button" id="submit" hx-post="/updatePermissions" hx-vals="#updatePermissions" hx-swap="outerHTML">Update  </button>');
        return;
    }
}

// Container charts
export const Chart = async (req, res) => {
    let name = req.header('hx-trigger-name');
    if (!stats[name]) { stats[name] = { cpuArray: Array(15).fill(0), ramArray: Array(15).fill(0) }; }
    const info = await dockerContainerStats(name);
    stats[name].cpuArray.push(Math.round(info[0].cpuPercent));
    stats[name].ramArray.push(Math.round(info[0].memPercent));
    stats[name].cpuArray = stats[name].cpuArray.slice(-15);
    stats[name].ramArray = stats[name].ramArray.slice(-15);
    let chart = `
        <script>
            ${name}chart.updateSeries([{data: [${stats[name].cpuArray}]}, {data: [${stats[name].ramArray}]}])
        </script>`
    res.send(chart);
}