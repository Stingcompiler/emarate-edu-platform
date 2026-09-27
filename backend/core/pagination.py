from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """``?page=&page_size=`` — default 25, max 100 (docs/05 §7)."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100
