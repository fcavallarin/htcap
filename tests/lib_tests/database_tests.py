import unittest
import sqlite3

from mock import MagicMock, PropertyMock, call, patch

from core.lib.database import Database


class DatabaseTestCase(unittest.TestCase):
	def setUp(self):
		self.connection_mock = MagicMock()
		self.cursor_mock = MagicMock()
		self.cursor_mock.execute = MagicMock()
		self.cursor_mock.fetchone = MagicMock()
		self.cursor_mock.fetchall = MagicMock(return_value=[])
		self.connection_mock.cursor = MagicMock(return_value=self.cursor_mock)
		self.connect_method_mock = MagicMock()
		self.commit_method_mock = MagicMock()
		self.close_method_mock = MagicMock()

		self.db = Database('my_db')

		self.db.conn = self.connection_mock
		self.db.connect = self.connect_method_mock
		self.db.commit = self.commit_method_mock
		self.db.close = self.close_method_mock


class DatabaseTest(DatabaseTestCase):
	def test_constructor(self):
		db = Database('my_db')

		self.assertEqual(db.dbname, 'my_db')
		self.assertEqual(db.conn, None)

	def test___str__(self):
		db = Database('my_db')

		self.assertEqual(str(db), 'my_db')

	def test_connect(self):
		sqlite3_mock = MagicMock()
		row_factory_mock = PropertyMock(return_value=None)

		type(sqlite3_mock).row_factory = row_factory_mock
		sqlite3.connect = sqlite3_mock

		db = Database('my_db')
		db.connect()

		sqlite3.connect.assert_called_with('my_db')
		self.assertIsInstance(db.conn, MagicMock)

	def test_close(self):
		close_mock = MagicMock()
		self.connection_mock.close = close_mock
		db = Database('my_db')
		db.conn = self.connection_mock

		db.close()

		close_mock.assert_called_once()

	def test_begin(self):
		self.db.begin()

		self.assertEqual(self.connection_mock.isolation_level, None)
		self.connection_mock.execute.assert_called_once_with("BEGIN TRANSACTION")

	def test_commit(self):
		self.connection_mock.commit = MagicMock()
		db = Database('my_db')
		db.conn = self.connection_mock

		db.commit()

		self.connection_mock.commit.assert_called_once()

	def test_create_success(self):
		self.db.initialize()

		self.connect_method_mock.assert_called_once()
		self.assertEqual(self.cursor_mock.execute.call_count, 8)
		self.commit_method_mock.assert_called_once()
		self.close_method_mock.assert_called_once()

	def test_save_crawl_info_empty(self):
		self.db.save_crawl_info()

		self.connect_method_mock.assert_called_once()
		self.cursor_mock.execute.assert_called_once_with("UPDATE crawl_info SET ", [])
		self.commit_method_mock.assert_called_once()
		self.close_method_mock.assert_called_once()

	def test_save_crawl_info(self):
		self.db.save_crawl_info(
			htcap_version="42.0", target="my target", start_date="my start date",
			end_date="my end date", commandline="my commandline", user_agent="some user agent"
		)

		self.connect_method_mock.assert_called_once()
		self.cursor_mock.execute.assert_called_once_with(
			"UPDATE crawl_info SET htcap_version=?, target=?, start_date=?, end_date=?, commandline=?, user_agent=?",
			["42.0", "my target", "my start date", "my end date", "my commandline", "some user agent"])
		self.commit_method_mock.assert_called_once()
		self.close_method_mock.assert_called_once()

	def test_save_request_new_request_no_parent(self):
		"""
		case where the request is new and has no parent
		"""
		fetchone_returns = [None, {'id': 42}]

		def fetchone_side_effect():
			result = fetchone_returns.pop(0)
			return result

		request = MagicMock()
		request.parent_db_id = None
		request.type = "request type"
		request.method = "METHOD"
		request.url = "my url"
		request.referer = "some referrer"
		request.redirects = "some redirection"
		request.data = "some data"
		request.cookies = {}
		request.http_auth = None
		request.out_of_scope = False
		request.trigger = None
		request.html = None
		request.user_output = []

		self.cursor_mock.fetchone.side_effect = fetchone_side_effect

		self.db.save_request(request)

		self.assertEqual(self.cursor_mock.execute.call_count, 3)
		self.assertEqual(
			self.cursor_mock.execute.call_args_list[0],
			call(
				'SELECT * FROM request WHERE type=? AND method=? AND url=? AND http_auth=? AND data=? AND trigger=?',
				("request type", "METHOD", "my url", "", "some data", "")
			)
		)
		self.assertEqual(
			self.cursor_mock.execute.call_args_list[1],
			call(
				'INSERT INTO request (id_parent, type, method, url, referer, redirects, data, cookies, http_auth, out_of_scope, trigger, html, user_output) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
				(
					None, "request type", "METHOD", "my url", "some referrer", "some redirection", "some data", "[]",
					"", 0,
					"", "", "")
			)
		)
		self.assertEqual(
			self.cursor_mock.execute.call_args_list[2],
			call(
				"SELECT last_insert_rowid() AS id"
			)
		)

	def test_save_request_old_request_with_parent(self):
		"""
		case where the request exist and has a parent
		"""

		cookie_mock = MagicMock()
		cookie_mock.get_dict = MagicMock(return_value={"cookie_value_1": "value1"})

		request = MagicMock()
		request.parent_db_id = 42
		request.type = "request type"
		request.method = "METHOD"
		request.url = "my url"
		request.referer = "some referrer"
		request.redirects = "some redirection"
		request.data = "some data"
		request.cookies = [cookie_mock]
		request.http_auth = "auth"
		request.out_of_scope = True
		request.trigger = ["trigger1", "trigger2"]
		request.html = "<html></html>"
		request.user_output = ['some', 'output']

		self.cursor_mock.fetchone.return_value = {"id": 53}

		self.db.save_request(request)

		self.assertEqual(self.cursor_mock.execute.call_count, 2)
		self.assertEqual(
			self.cursor_mock.execute.call_args_list[0],
			call(
				'SELECT * FROM request WHERE type=? AND method=? AND url=? AND http_auth=? AND data=? AND trigger=?',
				("request type", "METHOD", "my url", "auth", "some data", '["trigger1", "trigger2"]')
			)
		)
		self.assertEqual(
			self.cursor_mock.execute.call_args_list[1],
			call(
				"INSERT INTO request_child (id_request, id_child) VALUES (?,?)",
				(42, 53)
			)
		)

	def test_save_crawl_result_not_crawled(self):
		result = MagicMock()
		result.errors = []
		result.request = MagicMock()
		result.request.html = None
		result.request.user_output = []
		result.request.db_id = 42

		self.db.save_crawl_result(result=result, crawled=None)

		self.cursor_mock.execute.assert_called_once_with(
			"UPDATE request SET crawled=?, crawler_errors=?, html=?, user_output=? WHERE id=?",
			(0, "[]", "", "", 42)
		)

	def test_save_crawl_result_crawled(self):
		result = MagicMock()
		result.errors = ["some", "errors"]
		result.request = MagicMock()
		result.request.html = "<html></html>"
		result.request.user_output = ["some", "outputs"]
		result.request.db_id = 42

		self.db.save_crawl_result(result=result, crawled=True)

		self.cursor_mock.execute.assert_called_once_with(
			"UPDATE request SET crawled=?, crawler_errors=?, html=?, user_output=? WHERE id=?",
			(1, '["some", "errors"]', "<html></html>", '["some", "outputs"]', 42)
		)

	def test_get_requests_without_result(self):
		results = self.db.get_requests()

		self.connect_method_mock.assert_called_once()
		self.cursor_mock.execute.assert_called_once_with(
			"SELECT * FROM request WHERE out_of_scope=0 AND type IN (?)",
			["xhr"]
		)
		self.close_method_mock.assert_called_once()
		self.assertEqual(results, [])

	@patch('core.lib.database.Request')
	def test_get_requests_with_result(self, request_mock):
		self.cursor_mock.fetchall.return_value = [
			{
				"id": 42, "id_parent": 53,
				"type": "my type", "method": "METHOD", "url": "some url",
				"referer": "from here", "data": "some data", "cookies": "some cookies"
			}
		]

		self.db.get_requests("xhr,an_other_type")

		request_mock.assert_called_once_with(
			"my type", "METHOD", "some url", data="some data", db_id=42,
			json_cookies="some cookies", parent_db_id=53,
			referer="from here"
		)

	def test_create_assessment(self):
		self.cursor_mock.fetchone.return_value = {"id": 42}

		result = self.db.create_assessment('my scanner', 'start date')

		self.connect_method_mock.assert_called_once()

		self.assertEqual(self.cursor_mock.execute.call_count, 2)
		self.assertEqual(
			self.cursor_mock.execute.call_args_list[0],
			call(
				"INSERT INTO assessment (scanner, start_date) VALUES (?,?)",
				("my scanner", "start date")
			)
		)
		self.assertEqual(
			self.cursor_mock.execute.call_args_list[1],
			call(
				"SELECT last_insert_rowid() as id"
			)
		)
		self.assertEqual(result, 42)
		self.commit_method_mock.assert_called_once()
		self.close_method_mock.assert_called_once()

	def test_save_assessment(self):
		self.db.save_assessment(42, "end date")

		self.connect_method_mock.assert_called_once()
		self.cursor_mock.execute.assert_called_once_with(
			"UPDATE assessment SET end_date=? WHERE id=?",
			("end date", 42)
		)
		self.commit_method_mock.assert_called_once()
		self.close_method_mock.assert_called_once()

	def test_insert_vulnerability(self):
		self.db.insert_vulnerability(42, 53, "my type", "my description")

		self.connect_method_mock.assert_called_once()
		self.cursor_mock.execute.assert_called_once_with(
			"INSERT INTO vulnerability (id_assessment, id_request, type, description, error) VALUES (?,?,?,?,?)",
			(42, 53, "my type", "my description", "")
		)
		self.commit_method_mock.assert_called_once()
		self.close_method_mock.assert_called_once()

	@patch('core.lib.database.Request')
	def test_get_crawled_request(self, request_mock):
		self.cursor_mock.fetchall.return_value = [
			{
				"id": 42, "id_parent": 53,
				"type": "my type", "method": "METHOD", "url": "some url",
				"referer": "from here", "data": "some data", "cookies": "some cookies"
			}
		]
		results = self.db.get_crawled_request()

		self.connect_method_mock.assert_called_once()
		self.cursor_mock.execute.assert_called_once_with(
			"SELECT * FROM request WHERE crawled=1"
		)
		request_mock.assert_called_once_with(
			"my type", "METHOD", "some url", data="some data", db_id=42,
			json_cookies="some cookies", parent_db_id=53,
			referer="from here"
		)
		self.close_method_mock.assert_called_once()
		self.assertEqual(len(results), 1)

	@patch('core.lib.database.Request')
	def test_get_not_crawled_request(self, request_mock):
		self.cursor_mock.fetchall.return_value = [
			{
				"id": 42, "id_parent": 53,
				"type": "my type", "method": "METHOD", "url": "some url",
				"referer": "from here", "data": "some data", "cookies": "some cookies"
			}
		]
		results = self.db.get_not_crawled_request()

		self.connect_method_mock.assert_called_once()
		self.cursor_mock.execute.assert_called_once_with(
			"SELECT * FROM request WHERE crawled=0 AND out_of_scope=0"
		)
		request_mock.assert_called_once_with(
			"my type", "METHOD", "some url", data="some data", db_id=42,
			json_cookies="some cookies", parent_db_id=53,
			referer="from here"
		)
		self.close_method_mock.assert_called_once()
		self.assertEqual(len(results), 1)
