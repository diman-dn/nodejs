var loadtest = require('loadtest');
var expect = require('chai').expect;
suite('Стрессовые тесты', function () {
    test('Домашняя страница должна обрабатывать 50 запросов в секунду', function (done) {
        var options = {
            url: 'http://localhost:3000',
            concurrency: 4,
            maxRequests: 50,
        };
        loadtest.loadTest(options, function (err, result) {
            expect(!err);
            expect(result.totalTimeSeconds < 1);
            done();
        });
    });
});