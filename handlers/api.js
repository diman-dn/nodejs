var Attraction = require('../models/attraction');

/**
 * Контроллер возврата всех подтвержденных достопримечательностей
 * @param req
 * @param res
 */
exports.attractions = function (req, res) {
    Attraction.find({ approved: true }, function (err, attractions) {
        if(err) return res.status(500).send('Произошла ошибка: ошибка базы данных.');
        res.json(attractions.map(function (a) {
            return {
                name: a.name,
                id: a._id,
                description: a.description,
                location: a.location,
            }
        }));
    });
};

/**
 * Контроллер добавления достопримечательности
 * @param req
 * @param res
 */
exports.attractionAdd = function (req, res) {
    var a = new Attraction({
        name: req.body.name,
        description: req.body.description,
        location: { lat: req.body.lat, lng: req.body.lng },
        history: {
            event: 'created',
            email: req.body.email,
            date: new Date(),
        },
        approved: false,
    });
    a.save(function (err, a) {
        if(err) return res.status(500).send('Произошла ошибка: ошибка базы данных.');
        res.json({ id: a._id });
    });
};

/**
 * Контроллер возвращает достопримечательность по id
 * @param req
 * @param res
 */
exports.attractionById = function (req, res) {
    Attraction.findById(req.params.id, function (err, a) {
        if(err) return res.status(500).send('Произошла ошибка: ошибка базы данных.');
        res.json({
            name: a.name,
            id: a._id,
            description: a.description,
            location: a.location,
        });
    });
};