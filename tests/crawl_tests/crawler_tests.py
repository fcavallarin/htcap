import unittest

from core.constants import *
from core.crawl.crawler import Crawler

from mock import patch


class CrawlerTest(unittest.TestCase):
	@patch('core.crawl.crawler.generate_filename', return_value='my_out_file-1')
	@patch('core.crawl.crawler.Database')
	def test__get_database_rename_outfile(self, database_mock, generate_filename_mock):
		db = Crawler._get_database('my_out_file', CRAWLOUTPUT_RENAME)

		generate_filename_mock.assert_called_once_with('my_out_file', out_file_overwrite=False)
		database_mock.assert_called_once_with('my_out_file-1')
		db.initialize.assert_called_once()

	@patch('core.crawl.crawler.Database')
	@patch('core.crawl.crawler.os.path.exists', return_value=True)
	@patch('core.crawl.crawler.os.remove')
	def test__get_database_overwrite_outfile(
			self,
			os_remove_mock,
			os_path_exists_mock,
			database_mock):
		db = Crawler._get_database('my_out_file', CRAWLOUTPUT_OVERWRITE)

		os_path_exists_mock.assert_called_once_with('my_out_file')
		os_remove_mock.assert_called_once_with('my_out_file')
		database_mock.assert_called_once_with('my_out_file')
		db.initialize.assert_called_once()

	@patch('core.crawl.crawler.Database')
	@patch('core.crawl.crawler.os.path.exists', return_value=True)
	def test__get_database_complete_outfile(self, os_path_exists_mock, database_mock):
		db = Crawler._get_database('my_out_file', CRAWLOUTPUT_COMPLETE)

		database_mock.assert_called_once_with('my_out_file')
		os_path_exists_mock.assert_called_once_with('my_out_file')
		self.assertEqual(db.initialize.call_count, 0)

	@patch('core.crawl.crawler.Database')
	@patch('core.crawl.crawler.os.path.exists', return_value=False)
	def test__get_database_resume_new_outfile(self, os_path_exists_mock, database_mock):
		db = Crawler._get_database('my_out_file', CRAWLOUTPUT_RESUME)

		database_mock.assert_called_once_with('my_out_file')
		os_path_exists_mock.assert_called_once_with('my_out_file')
		self.assertEqual(db.initialize.call_count, 1)
