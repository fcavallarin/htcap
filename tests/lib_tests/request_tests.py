import unittest

from mock import call, patch

from core.lib.request import Request


class RequestTestCase(unittest.TestCase):
	@patch('core.lib.request.remove_tokens')
	def test___eq__(self, remove_tokens_mock):
		a = Request("type1", "method1", "url1", data="data1", http_auth="auth1")
		b = Request("type1", "method1", "url1", data="data1", http_auth="auth1")
		self.assertTrue(a == b)

		a = Request("type1", "method1", "url1", data="data1", http_auth="auth1")
		b = Request("type2", "method1", "url1", data="data1", http_auth="auth1")
		self.assertFalse(a == b)

		a = Request("type1", "method1", "url1", data="data1", http_auth="auth1")
		b = Request("type1", "method2", "url1", data="data1", http_auth="auth1")
		self.assertFalse(a == b)

		a = Request("type1", "method1", "url1", data="data1", http_auth="auth1")
		b = Request("type1", "method1", "url2", data="data1", http_auth="auth1")
		self.assertFalse(a == b)

		a = Request("type1", "method1", "url1", data="data1", http_auth="auth1")
		b = Request("type1", "method1", "url1", data="data2", http_auth="auth1")
		self.assertFalse(a == b)

		a = Request("type1", "method1", "url1", data="data1", http_auth="auth1")
		b = Request("type1", "method1", "url1", data="data1", http_auth="auth2")
		self.assertFalse(a == b)

		a = Request("type1", "method1", "url1")
		b = None
		self.assertFalse(a == b)
		self.assertEqual(remove_tokens_mock.call_count, 0)

	@patch('core.lib.request.remove_tokens', return_value="some data")
	def test___eq__with_post(self, remove_tokens_mock):
		a = Request("type1", "POST", "url1", data="dataXXXX")
		b = Request("type1", "POST", "url1", data="dataYYYY")

		self.assertTrue(a == b)
		self.assertEqual(remove_tokens_mock.call_args_list, [call("dataXXXX"), call("dataYYYY")])
