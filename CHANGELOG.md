# Changelog

All notable changes to this project will be documented in this file.

## 0.5.0

### Fixed
- Fix parallel script execution in build and zip tasks to properly propagate errors
- Fix changeset baseBranch configuration to use master as default branch

## 0.4.0

### Added
- New viewer UI built with React and shadcn
- Comprehensive roundtrip tests for TLD index encoding

### Changed
- Unify on v4 msgpack with dual transport adapters
- Deterministic TLD restoration in decoder
- TLD index encoding in normalizer
- Lower compression threshold from 500 to 200 bytes

### Fixed
- Remove stale js files and add clean targets to monorepo

## 0.3.0

### Added
- Add `/s/new` page for on-the-fly stash creation
- Add vitest for codec package tests

### Fixed
- Fix codec URL encoding (remove TLD stripping)
