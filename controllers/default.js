var isGenerating = false;
var isGenerated = false;
exports.install = function() {
	// CMS rendering
	F.route('/*', view_page);
	F.route('#sitemap', view_sitemap);

	// POSTS
	F.route('#blogs',            view_blogs, ['*Post']);
	F.route('#blogsdetail',      view_blogs_detail, ['*Post']);

	// FILES
        F.file('sitemap.xml', file_xml);
	F.file('/download/', file_read);
};

// ==========================================================================
// CMS (Content Management System)
// ==========================================================================

function view_page() {
	var self = this;
	// models/pages.js --> Controller.prototype.render()
	self.render(self.url);
}

// ==========================================================================
// FILES
// ==========================================================================

// Reads a specific file from database
// For images (jpg, gif, png) supports percentual resizing according "?s=NUMBER" argument in query string e.g.: .jpg?s=50, .jpg?s=80 (for image galleries)
// URL: /download/*.*
function file_read(req, res) {

	var id = req.split[1].replace('.' + req.extension, '');
	var resize = req.query.s && (req.extension === 'jpg' || req.extension === 'gif' || req.extension === 'png') ? true : false;

	if (!resize) {
		// Reads specific file by ID
		F.exists(req, res, function(next, filename) {
			DB('files').binary.read(id, function(err, stream, header) {

				if (err) {
					next();
					return res.throw404();
				}

				var writer = require('fs').createWriteStream(filename);

				CLEANUP(writer, function() {
					res.file(filename);
					next();
				});

				stream.pipe(writer);
			});
		});
		return;
	}

	// Custom image resizing

	var size;

	// Small hack for the file cache.
	// F.exists() uses req.uri.pathname for creating temp identificator and skips all query strings by creating (because this hack).
	if (req.query.s) {
		size = req.query.s.parseInt();
		req.uri.pathname = req.uri.pathname.replace('.', size + '.');
	}

	// Below method checks if the file exists (processed) in temporary directory
	// More information in total.js documentation
	F.exists(req, res, 10, function(next, filename) {

		// Reads specific file by ID
		DB('files').binary.read(id, function(err, stream, header) {

			if (err) {
				next();
				return res.throw404();
			}

			var writer = require('fs').createWriteStream(filename);

			CLEANUP(writer, function() {

				// Releases F.exists()
				next();

				// Image processing
				res.image(filename, function(image) {
					image.output(req.extension);
					req.extension === 'jpg' && image.quality(85);
					size && image.resize(size + '%');
					image.minify();
				});
			});

			stream.pipe(writer);
		});
	});
}

// ============================================
// POSTS
// ============================================

function view_blogs() {
	var self = this;
	var options = {};

	options.category = 'Blogs';

	if (self.query.q)
		options.search = self.query.q;

	if (self.query.page)
		options.page = self.query.page;

	self.$query(options, self.callback('blogs-all'));
}

function view_blogs_detail(linker) {
	var self = this;
	var options = {};
	options.category = 'Blogs';
	options.linker = linker;
	self.$read(options, function(err, response) {
		if (err)
			return self.throw404(err);
		NOSQL('posts').counter.hit(response.id);
		self.view('blogs-detail', response);
	});
}

// ============================================
// XML Sitemap
// ============================================


function file_xml(req, res, validation) {

    if (validation)
        return req.url === '/sitemap.xml';

    var options = {hostname: req.hostname(), path: F.path.public('sitemap.xml')};

    // Is processed sitemap.xml?
    if (isGenerated) {
        console.log('sitemap.xml -> cache');
        res.continue();
        return;
    }

    // Handle multiple requests
    // [isGenerating === true] the request must wait
    if (isGenerating) {
        setTimeout(function () {
            file_xml(req, res, validation);
        }, 1000);
        return;
    }

    isGenerating = true;

    options.sitemap = F.global.sitemap;
    //console.log(options.sitemap);


    console.log('sitemap.xml -> creating');
    var worker = F.worker('sitemap', 'sitemap', 5000);

    // Send settings
    worker.send(options);

    // Handle exit
    worker.once('exit', function () {

        console.log('sitemap.xml -> created');

        isGenerating = false;
        isGenerated = true;

        res.continue();
    });

}

function view_sitemap() {
    var self = this;
    
    self.view('sitemap', F.global.sitemap);
}
