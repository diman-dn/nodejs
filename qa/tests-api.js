var assert = require('chai').assert;
var http = require('http');
var rest = require('restler');

suite('API tests', function () {
    var attraction = {
        lat: 45.516011,
        lng: -122.682062,
        name: 'Художественный музей Портленда',
        description: 'Не упустите возможность посмотреть созданную в 1892 году коллекцию произведений местного искусства художественного музея Портленда. Если же вам больше по душе современное искусство, к вашим услугам шесть этажей, посвященных современному искусству.',
        email: 'test@meadowlarktravel.com',
    };

    var base = 'http://localhost:3000';

    test('Проверка возможности добавления достопримечательности', function (done) {
        rest.post(base + '/api/attraction', { data: attraction }).on('success', function (data) {
            assert.match(data.id, /\w/, 'должен быть задан id');
            done();
        });
    });

    test('Проверка возможности извлечения достопримечательности', function (done) {
        rest.post(base + '/api/attraction', { data: attraction }).on('success', function (data) {
            rest.get(base + '/api/attraction/' + data.id).on('success', function (data) {
                assert(data.name === attraction.name);
                assert(data.description === attraction.description);
                done();
            })
        })
    });
});
