$(document).ready(function () {
    // Вывод года в футере
    var date = new Date();
    $('#year').html(date.getFullYear());
});
