def priced(fn):
    """A decorator with a real wrapper: calling a @priced function runs
    `priced.wrapper` (credited as the nested function it is) and then the
    decorated function itself."""
    def wrapper(*args):
        return round(fn(*args), 2)
    return wrapper


@priced
def unit_price(item):
    return item['price'] * 1.1


def unused_estimate(cart):
    """Known by construction: no test calls this, so it must not be traced."""
    return len(cart)


class Cart:
    def __init__(self):
        self._items = []

    def add(self, name, price):
        def line():
            return {'name': name, 'price': price}
        self._items.append(line())

    @property
    def total(self):
        ordered = sorted(self._items, key=lambda item: item['name'])
        return sum(unit_price(item) for item in ordered)

    @total.setter
    def total(self, value):
        """Known by construction: the getter runs; this setter never does."""
        self._items = [{'name': 'override', 'price': value}]
