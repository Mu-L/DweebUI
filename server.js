import express from 'express';
import session from 'express-session';
import memorystore from 'memorystore';
import ejs from 'ejs';
import Docker from 'dockerode';
import { router } from './router/index.js';
import { sequelize, Container } from './database/models.js';
import { currentLoad, mem, networkStats, fsSize } from 'systeminformation';
import { containerCard } from './components/containerCard.js';
export var docker = new Docker();

export { event, sse, cpu, ram, tx, rx, disk }

const app = express();
const MemoryStore = memorystore(session);
const port = process.env.PORT || 8000;

// Session middleware
const sessionMiddleware = session({
    store: new MemoryStore({ checkPeriod: 86400000 }), // Prune expired entries every 24h
    secret: "keyboard cat", 
    resave: false, 
    saveUninitialized: false, 
    cookie:{
        secure:false, // Only set to true if you are using HTTPS.
        httpOnly:false, // Only set to true if you are using HTTPS.
        maxAge:3600000 * 8 // Session max age in milliseconds. 3600000 = 1 hour.
    }
});

// Express middleware
app.set('view engine', 'html');
app.engine('html', ejs.renderFile);
app.use([
    express.static('public'),
    express.json(),
    express.urlencoded({ extended: true }),
    sessionMiddleware,
    router
]);

// Initialize server
app.listen(port, async () => {
    async function init() {
        try { await sequelize.authenticate().then(
            () => { console.log('DB Connection: ✔️') }); }
            catch { console.log('DB Connection: ❌'); }
        try { await sequelize.sync().then( // check out that formatting
            () => { console.log('Synced Models: ✔️') }); }
            catch { console.log('Synced Models: ❌'); } }
        await init().then(() => { 
            console.log(`Listening on http://localhost:${port} ✔️`);
    });
});

let [ cpu, ram, tx, rx, disk ] = [0, 0, 0, 0, 0];
let [ hidden, cardList, sentList ] = ['', '', ''];
let event = false;
let sse = false;
let eventInfo = '';

// Server metrics
let serverMetrics = async () => {
    currentLoad().then(data => { 
        cpu = Math.round(data.currentLoad); 
    });
    mem().then(data => { 
        ram = Math.round((data.active / data.total) * 100); 
    });
    networkStats().then(data => { 
        tx = data[0].tx_bytes / (1024 * 1024); 
        rx = data[0].rx_bytes / (1024 * 1024); 
    });
    fsSize().then(data => { 
        disk = data[0].use; 
    });
}
setInterval(serverMetrics, 1000);

// Get hidden containers
async function getHidden() {
    hidden = await Container.findAll({ where: {visibility:false}});
    hidden = hidden.map((container) => container.name);
}

// Create list of docker containers cards
let containerCards = async () => {
    let list = '';
    const allContainers = await docker.listContainers({ all: true });
    for (const container of allContainers) {
        if (!hidden.includes(container.Names[0].slice(1))) {

            let imageVersion = container.Image.split('/');
            let service = imageVersion[imageVersion.length - 1].split(':')[0];
            let containerId = docker.getContainer(container.Id);
            let containerInfo = await containerId.inspect();
            let ports_list = [];
            try {
            for (const [key, value] of Object.entries(containerInfo.HostConfig.PortBindings)) {
                let ports = {
                    check: 'checked',
                    external: value[0].HostPort,
                    internal: key.split('/')[0],
                    protocol: key.split('/')[1]
                }
                ports_list.push(ports);
            }
            } catch {}

            let external_port = ports_list[0]?.external || 0;
            let internal_port = ports_list[0]?.internal || 0;

            let container_info = {
                name: container.Names[0].slice(1),
                service: service,
                id: container.Id,
                state: container.State,
                image: container.Image,
                external_port: external_port,
                internal_port: internal_port,
                ports: ports_list,
                link: 'localhost',
            }
            let card = containerCard(container_info);
            list += card;
        }
    }
    cardList = list;
}

// Docker events
docker.getEvents((err, stream) => {
    if (err) throw err;
    stream.on('data', (chunk) => {
        event = true;
        eventInfo = 'docker';
    });
});

// Check if the container cards need to be updated
setInterval(async () => {
    if (event == false) { return; }
    await getHidden();
    await containerCards();
    if (cardList != sentList) {
        cardList = sentList;
        sse = true;
    }
    event = false;
}, 1000);

// Gets called at load and after server-side events
router.get('/containers', async (req, res) => {
    await getHidden();
    await containerCards();
    sentList = cardList;
    res.send(cardList);
});


router.get('/sse_event', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', });
    let eventCheck = setInterval(async () => {
        if (sse == true) {
            sse = false;
            console.log(`event: ${eventInfo}`);
            res.write(`event: ${eventInfo}\n`);
            res.write(`data: there was an event!\n\n`);
        }
    }, 1000);
    req.on('close', () => {
        clearInterval(eventCheck);
    });
});


router.get('/installing', async (req, res) => {
    
    let install_info = {
        name: 'App Name',
        service: '',
        id: '',
        state: 'Installing',
        image: '',
        external_port: 0,
        internal_port: 0,
        ports: '',
        link: 'localhost',
    }
    let card = containerCard(install_info);
    res.send(card);
});