suite('Тесты страницы "О нас"', function () {
    test('Страница должна содержать ссылку на страницу "Контакты"', function () {
        assert($('a[href="/contact"]').length);
    });
});
