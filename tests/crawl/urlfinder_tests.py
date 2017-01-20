import unittest

from core.crawl.lib.urlfinder import UrlFinder


class UrlFinderTest(unittest.TestCase):
    def test_empty_html(self):
        html_sample = ""
        finder = UrlFinder(html_sample)

        self.assertEqual(finder.get_urls(), [])

    def test_basic_html(self):
        html_sample = """<!DOCTYPE html>
            <html>
            <head>
                <title></title>
            </head>
            <body>
            </body>
            </html>"""
        finder = UrlFinder(html_sample)

        self.assertEqual(finder.get_urls(), [])

    def test_with_relative_link(self):
        html_sample = '<a href="test.html">test</a>'
        finder = UrlFinder(html_sample)

        self.assertEqual(finder.get_urls(), ["test.html"])

    def test_with_relative_link_and_base_href(self):
        html_sample = """<!DOCTYPE html>
            <html>
            <head>
                <base href=" http://somewhere.else/someWeirdPath/ " target="_self">
            </head>
            <body>
            <a href="test.html">test</a>
            </body>
            </html>"""
        finder = UrlFinder(html_sample)
        self.assertEqual(finder.get_urls(), ["http://somewhere.else/someWeirdPath/test.html"])

        html_sample = """<!DOCTYPE html>
            <html>
            <head>
                <base href="http://somewhere.else/someWeirdPath" target="_self">
            </head>
            <body>
            <a href="test.html">test</a>
            </body>
            </html>"""
        finder = UrlFinder(html_sample)
        self.assertEqual(finder.get_urls(), ["http://somewhere.else/someWeirdPath/test.html"])

        html_sample = """<!DOCTYPE html>
            <html>
            <head>
                <base href="http://somewhere.else/someWeirdPath/index.html" target="_self">
            </head>
            <body>
            <a href="test.html">test</a>
            </body>
            </html>"""
        finder = UrlFinder(html_sample)
        self.assertEqual(finder.get_urls(), ["http://somewhere.else/someWeirdPath/test.html"])

    def test_with_anchor_link(self):
        html_sample = '<a href="#test">test</a>'
        finder = UrlFinder(html_sample)

        self.assertEqual(finder.get_urls(), [])

    def test_with_no_http_link(self):
        html_sample = '<a href="ftp://test.lan">test</a>'

        finder = UrlFinder(html_sample)

        self.assertEqual(finder.get_urls(), [])

    def test_with_http_absolute_link(self):
        html_sample = '<a href="http://test.lan">test</a>'

        finder = UrlFinder(html_sample)

        self.assertEqual(finder.get_urls(), ["http://test.lan"])

    def test_with_https_absolute_link(self):
        html_sample = '<a href="https://test.lan">test</a>'

        finder = UrlFinder(html_sample)

        self.assertEqual(finder.get_urls(), ["https://test.lan"])
