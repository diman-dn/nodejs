var credentials = require('../credentials');
// Подключение модуля для отправки писем (Nodemailer)
var emailService = require('../lib/email')(credentials);

/**
 * Контроллер страницы входа (Login)
 * @param req
 * @param res
 */
exports.index = function (req, res) {
    res.render('login', {
        title: 'Вход - Meadowlark Travel',
        csrf: csrf,
    });
};

/**
 * Контроллер процедуры входа
 * @param req
 * @param res
 */
exports.loginPost = function (req, res) {
    if(req.body.login) {
        if(req.body.username === 'admin' && req.body.pswd === 'admin') {
            // Запоминаем пользователя admin
            res.cookie('user', 'id=1', {
                signed: true,
                expires: new Date(Date.now() + 365*2*24*60*60*1000),
                httpOnly: true,
            });
            req.session.user = {
                id: 1,
                admin: true,
            };
            req.session.flash = {
                type: 'success',
                intro: 'Вход выполнен, admin!',
                message: '',
            };
            // Отправка письма админу об удачном входе на сайт
            let to = credentials.adminEmail; // Email администратора
            let subject = 'На сайте Meadowlark Travel выполнен вход';
            let body = '<h1 style="text-align: center">Письмо от Meadowlark Travel</h1>' +
                '<p>На сайте "Meadowlark Travel" был успешно выполнен вход, через страницу /login</p>' +
                '<p>IP клиента: ' + (req.headers['x-forwarded-for'] || req.connection.remoteAddress) + '</p>' +
                '<p>User-Agent: ' + req.headers.user + '</p>';
            emailService.send(to, subject, body);
            return res.redirect('/');
        }
        req.session.flash = {
            type: 'danger',
            intro: 'Не верный логин или пароль',
            message: '',
        };
    }
    return res.redirect('/login');
};

/**
 * Контроллер выхода (Logout)
 * @param req
 * @param res
 */
exports.logout = function (req, res) {
    if(req.body.logout) {
        res.clearCookie('user');
        res.clearCookie('ip');
        req.session = null;
        res.redirect('/');
    }
};