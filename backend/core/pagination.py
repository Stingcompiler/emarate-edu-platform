from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """``?page=&page_size=`` — default 10 (owner, 2026-09-29), max 100 (docs/05 §7).

    Lists people browse show 10 at a time with page controls; screens that need a whole
    set (menus, selects, summaries) ask for ``page_size=100`` explicitly."""

    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100
