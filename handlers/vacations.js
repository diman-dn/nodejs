var Vacation = require('../models/vacation');
var VacationInSeasonListener = require('../models/vacationInSeasonListener');

/**
 * Страница со списком туров
 * @param req
 * @param res
 */
exports.index = function (req, res) {
    Vacation.find({ available: true }, function (err, vacations) {
        var currency = req.session.currency || 'USD';
        var context = {
            currency: currency,
            vacations: vacations.map(function (vacation) {
                return {
                    sku: vacation.sku,
                    name: vacation.name,
                    description: vacation.description,
                    inSeason: vacation.inSeason,
                    price: convertFromUSD(vacation.priceInCents / 100, currency),
                    qty: vacation.qty,
                }
            })
        };
        switch (currency) {
            case 'USD': context.currencyUSD = 'selected'; break;
            case 'GBP': context.currencyGBP = 'selected'; break;
            case 'BTC': context.currencyBTC = 'selected'; break;
        }
        res.render('vacations', context);
    });
};

/**
 * Контроллер конкретного тура
 * @param req
 * @param res
 * @param next
 */
exports.vacation = function (req, res, next) {
    Vacation.findOne({ slug: req.params.vacation }, function (err, vacation) {
        if(err) return next(err);
        if(!vacation) return next();
        res.render('vacation', { vacation: vacation });
    });
};

/**
 * Подписка на уведомления о наступлении сезона для тура
 * @param req
 * @param res
 */
exports.notifySeason = function (req, res) {
    res.render('notify-me-when-in-season', { sku: req.query.sku });
};

/**
 * Обработка данных из формы подписки на уведомления о наступлении сезона для тура
 * @param req
 * @param res
 */
exports.notifySeasonPost = function (req, res) {
    if(!req.body.email.match(VALID_EMAIL_REGEX)) return res.next(new Error('Invalid email address.'));
    VacationInSeasonListener.update(
        { email: req.body.email },
        { $push: { skus: req.body.sku } },
        { upsert: true },
        function (err) {
            if(err) {
                console.error(err.stack);
                req.session.flash = {
                    type: 'danger',
                    intro: 'Ой!',
                    message: 'При обработке Вашего запроса произошла ошибка!',
                };
                return res.redirect(303, '/vacations');
            }
            req.session.flash = {
                type: 'success',
                intro: 'Спасибо!',
                message: 'Вы будете оповещены, когда наступит сезон для этого тура.',
            };
            return res.redirect(303, '/vacations');
        }
    );
};

/**
 * Контроллер выбора валюты для отображения цены на туры
 * @param req
 * @param res
 */
exports.setCurrency = function (req, res) {
    req.session.currency = req.params.currency;
    return res.redirect(303, '/vacations');
};

// Функция пересчета валюты
function convertFromUSD(value, currency) {
    switch (currency) {
        case 'USD': return value * 1; break;
        case 'GBP': return value * 0.6; break;
        case 'BTC': return value * 0.0023707918444761; break;
        default: return NaN;
    }
}