var Vacation = require('../models/vacation');
var credentials = require('../credentials');
// Подключение модуля для отправки писем (Nodemailer)
var emailService = require('../lib/email')(credentials);

// Регулярное выражение для проверки валидности email
var VALID_EMAIL_REGEX = new RegExp('^[a-zA-Z0-9.!#$%&\'*+\/=?^_`{|}~-]+@' +
    '[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?' +
    '(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$');

/**
 * Главная страница корзины
 * @param req
 * @param res
 * @param next
 */
exports.index = function (req, res, next) {
    var cart = req.session.cart || (req.session.cart = { items: [] });
    if(!cart) next();
    res.render('cart', { cart: cart });
};

/**
 * Добавление в корзину методом Get
 * @param req
 * @param res
 * @param next
 */
exports.cartAdd = function (req, res, next) {
    var cart = req.session.cart || (req.session.cart = { items: [] });
    Vacation.findOne({ sku: req.query.sku }, function (err, vacation) {
        if(err) return next(err);
        if(!vacation) return next(new Error('Unknown vacation SKU: ' + req.query.sku));
        cart.items.push({
            vacation: vacation,
            guests: req.body.guests || 1,
        });
        res.redirect(303, '/cart');
    });
};

/**
 * Добавление в корзину методом Post
 * @param req
 * @param res
 * @param next
 */
exports.cartAddPost = function (req, res, next) {
    var cart = req.session.cart || (req.session.cart = { items: [] });
    Vacation.findOne({ sku: req.body.sku }, function (err, vacation) {
        if(err) return next(err);
        if(!vacation) return next(new Error('Unknown vacation SKU: ' + req.query.sku));
        cart.items.push({
            vacation: vacation,
            guests: req.body.guests || 1,
        });
        res.redirect(303, '/cart');
    });
};

/**
 * Страница оформления покупки
 * @param req
 * @param res
 * @param next
 */
exports.cartCheckout = function (req, res, next) {
    var cart = req.session.cart;
    if(!cart) next();
    res.render('cart-checkout');
};

exports.cartCheckoutPost = function (req, res, next) {
    var cart = req.session.cart;
    if(!cart) next(new Error('Cart does not exist.'));
    var name = req.body.name || '', email = req.body.email || '';
    // Проверка валидности введенного email
    if(!email.match(VALID_EMAIL_REGEX)) return res.next(new Error('Invalid email address.'));
    // assign a random cart ID; normally we would use a database ID here
    cart.number = Math.random().toString().replace(/^0\.0*/, '');
    cart.billing = {
        name: name,
        email: email,
    };
    res.render('email/cart-thank-you',
        { layout: null, cart: cart }, function(err,html){
            if( err ) console.log('error in email template');
            emailService.send(cart.billing.email,
                'Thank you for booking your trip with Meadowlark Travel!',
                html);
        }
    );
    res.render('cart-thank-you', { cart: cart });
};

exports.cartThankyou = function (req, res) {
    res.render('cart-thank-you', { cart: req.session.cart });
};

exports.emailCartThankyou = function (req, res) {
    res.render('email/cart-thank-you', { cart: req.session.cart, layout: null });
};