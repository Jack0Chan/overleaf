import {
  screen,
  fireEvent,
  waitForElementToBeRemoved,
} from '@testing-library/react'
import { expect } from 'chai'
import fetchMock from 'fetch-mock'
import FileViewRefreshButton from '@/features/file-view/components/file-view-refresh-button'
import { renderWithEditorContext } from '../../../helpers/render-with-context'
import { USER_ID } from '../../../helpers/editor-providers'

describe('<FileViewRefreshButton />', function () {
  const projectFile = {
    name: 'example.tex',
    linkedFileData: {
      v1_source_doc_id: 'v1-source-id',
      source_project_id: 'source-project-id',
      source_entity_path: '/source-entity-path.ext',
      provider: 'project_file',
      importer_id: USER_ID,
    },
    created: new Date(2021, 1, 17, 3, 24).toISOString(),
  }

  const thirdPartyReferenceFile = {
    name: 'example.tex',
    linkedFileData: {
      provider: 'zotero',
      importer_id: USER_ID,
    },
    created: new Date(2021, 1, 17, 3, 24).toISOString(),
  }

  const thirdPartyNotOriginalImporterReferenceFile = {
    name: 'references.bib',
    linkedFileData: {
      v1_source_doc_id: 'v1-source-id',
      source_project_id: 'source-project-id',
      source_entity_path: '/source-entity-path.ext',
      provider: 'mendeley',
      importer_id: '123abc',
    },
    created: new Date(2021, 1, 17, 3, 24).toISOString(),
  }

  beforeEach(function () {
    fetchMock.reset()
  })

  it('Changes text when the file is refreshing', async function () {
    fetchMock.post(
      'express:/project/:project_id/linked_file/:file_id/refresh',
      {
        new_file_id: '5ff7418157b4e144321df5c4',
      }
    )

    renderWithEditorContext(<FileViewRefreshButton file={projectFile} />)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitForElementToBeRemoved(() =>
      screen.getByText('Refreshing', { exact: false })
    )

    await screen.findByText('Refresh')
  })

  it('Reindexes references after refreshing a file from a third-party provider', async function () {
    fetchMock.post(
      'express:/project/:project_id/linked_file/:file_id/refresh',
      {
        new_file_id: '5ff7418157b4e144321df5c4',
      }
    )

    renderWithEditorContext(
      <FileViewRefreshButton file={thirdPartyReferenceFile} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitForElementToBeRemoved(() =>
      screen.getByText('Refreshing', { exact: false })
    )

    expect(fetchMock.done()).to.be.true

    const lastCallBody = JSON.parse(fetchMock.lastCall()[1].body)
    expect(lastCallBody.shouldReindexReferences).to.be.true
  })

  it('is disabled when user is not original importer', function () {
    renderWithEditorContext(
      <FileViewRefreshButton
        file={thirdPartyNotOriginalImporterReferenceFile}
      />
    )

    const button = screen.getByRole('button', { name: 'Refresh' })

    expect(button.disabled).to.equal(true)
  })
})
