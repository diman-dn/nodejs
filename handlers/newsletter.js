var credentials = require('../credentials');
// Подключение модуля для отправки писем (Nodemailer)
var emailService = require('../lib/email')(credentials);

/**
 * Страница подписки на рассылку новостей
 * @param req
 * @param res
 */
exports.index = function (req, res) {
    res.render('newsletter', { csrf: csrf});
};

// for now, we're mocking NewsletterSignup:
function NewsletterSignup(){
}
NewsletterSignup.prototype.save = function(cb){
    cb();
};

/**
 * Прием и валидация данных из формы подписки на рассылку
 * @param req
 * @param res
 */
exports.submit = function (req, res) {
    var name = req.body.name || '', email = req.body.email || '';
    // Проверка вводимых данных
    if(!email.match(VALID_EMAIL_REGEX)) {
        if(req.xhr) {
            return res.json({error: 'Некорректный адрес электронной почты!'});
        }
        req.session.flash = {
            type: 'danger',
            intro: 'Ошибка проверки!',
            message: 'Введенный Вами электронный адрес не корректен.',
        };
        return res.redirect(303, '/newsletter/archive');
    }
    new NewsLetterSignup({name: name, email: email}).save(function (err) {
        if(err) {
            // Сообщаем админу об ошибке при подписке
            emailService.emailError('Попытка подписки не удалась!', __filename, err);
            if(req.xhr) return res.json({ error: 'Ошибка базы данных.' });
            req.session.flash = {
                type: 'danger',
                intro: 'Ошибка базы данных.',
                message: 'Произошла ошибка базы данных. Пожалуйста, попробуйте позднее',
            };
            return res.redirect(303, '/newsletter/archive');
        }
        if(req.xhr) return res.json({ success: true });
        req.session.flash = {
            type: 'success',
            intro: 'Спасибо!',
            message: 'Вы были подписаны на информационный бюллетень.',
        };
        return res.redirect(303, 'newsletter/archive');
    });
};