var fortune = require('../lib/fortune');
var credentials = require('../credentials');
// Подключение модуля для отправки писем (Nodemailer)
var emailService = require('../lib/email')(credentials);

/**
 * Главная страница сайта
 * @param req
 * @param res
 */
exports.home = function (req, res) {
    // Установка в подписанные куки значения юзер-агент
    // res.cookie('user', req.headers['user-agent'] + req.connection.remoteAddress, { signed: true });
    res.render('home', {
        title: 'Meadowlark Travel',
    });
};

/**
 * Страница О нас
 * @param req
 * @param res
 */
exports.about = function (req, res) {
    res.render('about', {
        title: 'О компании Meadowlark Travel',
        fortune: fortune.getFortune(),
        pageTestsScript: '/qa/tests-about.js'
    });
};

/**
 * Страница контакты
 * @param req
 * @param res
 */
exports.contact = function (req, res) {
    res.render('contact', {
        title: 'Контакты Meadowlark Travel'
    });
};

/**
 * Получение данных из формы обратной связи на странице контакты
 * @param req
 * @param res
 */
exports.contactPost = function (req, res) {
    if(req.body.submit) {
        let email = req.body.email || null;
        let subj = req.body.subject || null;
        let body = req.body.message || null;
        if(email && subj && body) {
            body = '<p>' + body + '</p><br>' + '<p>Отправитель: ' + email + '</p><br>';
            let to = credentials.adminEmail;
            emailService.send(to, subj, body);
            res.redirect(303, '/thank-you');
        }
    }
};

/**
 * Страница благодарности за действие
 * @param req
 * @param res
 */
exports.thankYou = function (req, res) {
    res.render('thank-you');
};