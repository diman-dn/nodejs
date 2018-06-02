module.exports = {
    checkWaivers: function (req, res, next) {
        var cart = req.session.cart;
        if (!cart) return next();
        if (cart.items.some(function (item) {
                return item.vacation.requiresWaiver;
            })) {
            if (!cart.warnings) cart.warnings = [];
            cart.warnings.push('Один или более выбранных Вами туров требуют документа про отказ от ответственности.');
        }
        next();
    },
    checkGuestCounts: function (req, res, next) {
        var cart = req.session.cart;
        if(!cart) return next();
        if(cart.items.some(function (item) {
            return item.guests > item.vacation.maximumGuests;
            })){
            if(!cart.errors) cart.errors = [];
            cart.errors.push('В одном или более из выбранных Вами туров недостаточно мест для выбранного Вами количества гостей');
        }
        next();
    }
};
