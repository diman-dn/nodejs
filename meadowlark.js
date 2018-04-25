var express = require('express');

var app = express();

// Установка механизма представления Handlebars
var handlebars = require('express-handlebars')
    .create({ defaultLayout: 'main' });
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

app.set('port', process.env.PORT || 3000);

app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res){
	res.render('home');
});
app.get('/about', function(req, res){
    var randomFortune = fortunes[Math.floor(Math.random() * fortunes.length)];
	res.render('about', {fortune: randomFortune});
});

// Пользовательская страница 404 (Обобщенный обработчик 404 (Промежуточное ПО))
app.use(function(req, res, next){
	res.status(404);
	res.render('404');
});

// Пользовательская страница 500 (Обработчик 500 (Промежуточное ПО))
app.use(function(err, req, res, next){
	console.error(err.stack);
	res.status(500);
	res.render('500');
});

app.listen(app.get('port'), function(){
	console.log('Express started at the http://localhost:' + app.get('port') + '; press Ctrl + C to exit.');
});

var fortunes = [
    "Победи свои страхи, или они победят тебя.",
    "Рекам нужны истоки.",
    "Не бойся неведомого.",
    "Тебя ждет приятный сюрприз.",
    "Будь проще везде, где только возможно.",
];