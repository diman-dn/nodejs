var formidable = require('formidable');
var fs = require('fs');

/**
 * Страница конкурса с загрузкой фото
 * @param req
 * @param res
 */
exports.vacationPhoto = function (req, res) {
    let now = new Date();
    res.render('contest/vacation-photo', {
        year: now.getFullYear(),
        month: now.getMonth()
    });
};


function saveContestEntry(contestName, email, year, month, photoPath) {
    // TODO
}

/**
 * Прием и валидация данных из формы для участия в конкурсе
 * @param req
 * @param res
 */
exports.vacationPhotoPost = function (req, res) {
    var form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
        if(err) {
            res.session.flash = {
                type: 'danger',
                intro: 'Ой!',
                message: 'Во время обработки отправленной Вами формы произошла ошибка. Пожалуста, попробуйте еще раз.',
            };
            return res.redirect(303, '/contest/vacation-photo');
        }
        // console.log('received fields: ');
        // console.log(fields);
        // console.log('received files: ');
        // console.log(files);

        // Проверка валидности введенного email
        if(!fields.email.match(VALID_EMAIL_REGEX)) return res.next(new Error('Invalid email address.'));

        var photo = files.photo;
        var dir = vacationPhotoDir + '/' + Date.now();
        var path = dir + '/' + photo.name;
        fs.mkdirSync(dir);
        fs.renameSync(photo.path, dir + '/' + photo.name);
        saveContestEntry('vacation-photo', fields.email, req.params.year, req.params.month, path);
        req.session.flash = {
            type: 'success',
            intro: 'Удачи!',
            message: 'Вы стали участником конкурса.',
        };

        res.redirect(303, '/contest/vacation-photo/entries');
    });
};