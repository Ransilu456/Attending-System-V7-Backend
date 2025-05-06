import chalk from 'chalk';
import figlet from 'figlet';
import ora from 'ora';

const icons = {
    info: '🔹',
    success: '✨',
    warning: '⚠️',
    error: '❌',
    database: '🗃️',
    server: '🚀',
    config: '⚙️',
    time: '🕒',
    user: '👤',
    security: '🔒',
    api: '🔌',
    web: '🌐',
    report: '📊',
    attendance: '📋',
    qr: '📱',
    message: '💬'
};

const spinners = {};

export const printBanner = () => {
    console.clear();
    
    const border = '═'.repeat(process.stdout.columns || 80);
    console.log(chalk.cyan(border));

    console.log(chalk.cyan(figlet.textSync('QR Attend V5', {
        font: 'ANSI Shadow',
        horizontalLayout: 'full'
    })));
    
    console.log(chalk.cyan('╔' + '═'.repeat((process.stdout.columns || 80) - 2) + '╗'));
    const subtitle = 'Smart Attendance Management System';
    const version = 'v5.0.0';
    const padding = Math.floor(((process.stdout.columns || 80) - subtitle.length - version.length - 4) / 2);
    console.log(
        chalk.cyan('║') + ' '.repeat(padding) + 
        chalk.bold.white(subtitle) + ' ' + chalk.gray(version) + 
        ' '.repeat((process.stdout.columns || 80) - subtitle.length - version.length - padding - 4) + 
        chalk.cyan('║')
    );
    console.log(chalk.cyan('╚' + '═'.repeat((process.stdout.columns || 80) - 2) + '╝'));
};

export const logInfo = (message) => {
    console.log(chalk.blue(icons.info) + ' ' + chalk.white(message));
};

export const logSuccess = (message) => {
    console.log(chalk.green(icons.success) + ' ' + chalk.greenBright(message));
};

export const logWarning = (message) => {
    console.log(chalk.yellow(icons.warning) + ' ' + chalk.yellowBright(message));
};

export const logError = (message, error = null) => {
    console.log('\n' + chalk.red(icons.error) + ' ' + chalk.redBright(message));
    if (error && error.stack) {
        console.log(chalk.red('  Stack Trace:'));
        console.log(chalk.dim(error.stack));
    }
    console.log();
};

export const logReport = (message) => {
    console.log(chalk.magenta(icons.report) + ' ' + chalk.magentaBright(message));
};

export const logAttendance = (message) => {
    console.log(chalk.green(icons.attendance) + ' ' + chalk.greenBright(message));
};

export const logQR = (message) => {
    console.log(chalk.blue(icons.qr) + ' ' + chalk.blueBright(message));
};

export const logMessage = (message) => {
    console.log(chalk.cyan(icons.message) + ' ' + chalk.cyanBright(message));
};

export const logSection = (title, icon = '') => {
    const sectionIcon = icons[title.toLowerCase()] || icon || '📌';
    const cols = process.stdout.columns || 80;
    console.log('\n' + chalk.cyan('┌─' + sectionIcon + '─' + '─'.repeat(cols - 6) + '┐'));
    console.log(chalk.cyan('│ ') + chalk.bold.white(title) + 
                ' '.repeat(cols - title.length - 4) + 
                chalk.cyan(' │'));
    console.log(chalk.cyan('└' + '─'.repeat(cols - 2) + '┘'));
};

export const logServerStart = (port) => {
    const message = `Server running on port ${port}`;
    const timestamp = new Date().toLocaleTimeString();
    const cols = process.stdout.columns || 80;
    
    console.log('\n' + chalk.green('┌' + '─'.repeat(cols - 2) + '┐'));
    console.log(chalk.green('│') + ' '.repeat((cols - message.length - 2) / 2) + 
                chalk.bold.white(message) + 
                ' '.repeat((cols - message.length - 2) / 2) + 
                chalk.green('│'));
    console.log(chalk.green('│') + ' '.repeat((cols - timestamp.length - 2) / 2) + 
                chalk.dim(timestamp) + 
                ' '.repeat((cols - timestamp.length - 2) / 2) + 
                chalk.green('│'));
    console.log(chalk.green('└' + '─'.repeat(cols - 2) + '┘\n'));
    
    logInfo('System is configured to count weekends in attendance reports');
};

export const startSpinner = (id, text) => {
    if (spinners[id]) {
        spinners[id].stop();
    }
    spinners[id] = ora({
        text: chalk.blue(text),
        spinner: 'dots',
        color: 'blue'
    }).start();
    return spinners[id];
};

export const updateSpinner = (id, text) => {
    if (spinners[id]) {
        spinners[id].text = chalk.blue(text);
    }
};

export const succeedSpinner = (id, text) => {
    if (spinners[id]) {
        spinners[id].succeed(chalk.green(text || spinners[id].text));
        delete spinners[id];
    }
};

export const failSpinner = (id, text) => {
    if (spinners[id]) {
        spinners[id].fail(chalk.red(text || spinners[id].text));
        delete spinners[id];
    }
};

export const stopSpinner = (id) => {
    if (spinners[id]) {
        spinners[id].stop();
        delete spinners[id];
    }
};

export const logTimeTaken = (operation, startTime) => {
    const timeTaken = Date.now() - startTime;
    console.log(chalk.blue(icons.time) + ' ' + chalk.white(`${operation}: ${timeTaken}ms`));
};

export const formatObject = (obj) => {
    return JSON.stringify(obj, null, 2);
};

export const logTable = (data, heading = '') => {
    if (!data || !data.length) {
        logWarning('No data to display in table');
        return;
    }
    
    if (heading) {
        console.log('\n' + chalk.cyan(heading));
    }
    
    console.table(data);
};
export const getIcons = () => icons;
