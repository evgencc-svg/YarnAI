from __future__ import annotations

import inspect

import yarnai_calculation


def test_public_api_exports_are_available() -> None:
    for name in yarnai_calculation.__all__:
        assert hasattr(yarnai_calculation, name)


def test_public_classes_and_functions_have_docstrings() -> None:
    public_objects = (
        getattr(yarnai_calculation, name)
        for name in yarnai_calculation.__all__
    )
    classes_and_functions = (
        value
        for value in public_objects
        if inspect.isclass(value) or inspect.isfunction(value)
    )
    assert all(inspect.getdoc(value) for value in classes_and_functions)


def test_calculate_is_exposed_from_package_root() -> None:
    from yarnai_calculation import calculate

    assert calculate is yarnai_calculation.calculate
