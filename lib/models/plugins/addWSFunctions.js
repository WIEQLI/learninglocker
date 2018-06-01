import { findIndex, last as loLast, map, isUndefined } from 'lodash';
import {
  modelToCursor,
  getParsedScopedFilter,
  getConnection,
  MAX_TIME_MS,
  MAX_SCAN,
  paginationToFilter,
  BACKWARDS,
  FORWARDS
} from 'lib/models/plugins/addCRUDFunctions';

// TODO: put new cursors in the correct position.
// TODO: removal of old cursors.
// TODO: cursor direction.
const receiveChange = ({ schema, cursorHistory, ws, sort }) => (change) => {
  const newCursor = modelToCursor(change, sort);
  let oldCursor = loLast(cursorHistory);

  const index = findIndex(cursorHistory, cur => cur === newCursor);
  if (index > 0) {
    oldCursor = cursorHistory[index - 1];
  } else {
    cursorHistory.push(newCursor);
  }

  ws.send(JSON.stringify({
    type: 'changed',
    schema,
    node: change,
    cursor: newCursor,
    before: oldCursor
  }));
};

async function getConnectionWsWatch({
  filter = {},
  authInfo,
  project,
  sort,
  before,
  after,
  inclusive = true, // should allways be called here with true
  first,
  last,

  modelName,
  watch
}) {
  const actionName = 'view';
  const limit = first || last;

  if (inclusive !== true) {
    throw new Error('inclusive should be true');
  }

  const parsedScopeFilter = await getParsedScopedFilter({
    authInfo,
    filter,
    modelName,
    actionName
  });

  const paginationFilter = [];
  if (before && last === Number.MAX_SAFE_INTEGER) {
    paginationFilter.push(paginationToFilter({
      cursor: before,
      inclusive,
      sort,
      paginationDirection: BACKWARDS
    }));
  }

  if (after) {
    paginationFilter.push(paginationToFilter({
      cursor: after,
      inclusive,
      sort,
      paginationDirection: FORWARDS
    }));
  }

  const pipeline = this.aggregate(parsedScopeFilter)
    .replaceRoot('fullDocument')
    .match({ $and: [parsedScopeFilter, ...paginationFilter] });

  if (limit) {
    pipeline.limit(limit);
  }

  if (project) {
    pipeline.project(project);
  }

  const changeStream = watch(pipeline.pipeline(), {
    fullDocument: 'updateLookup' // return full document on everything
  });

  // changeStream.on('change', receiveChange({
  //   schema: modelName,
  //   sort,
  //   cursorHistory,
  //   ws
  // }));

  return changeStream;
}

async function getConnectionWs({
  filter = {},
  authInfo,
  ws,
  project,
  sort = { _id: 1 },
  after,
  before,
  inclusive = false,

  first = 10,
  last,

  hint,
  maxTimeMS = MAX_TIME_MS,
  maxScan = MAX_SCAN

}) {
  const changedDocuments = [];

  let changeStream;
  if (before || after) {
    changeStream = getConnectionWsWatch({
      filter,
      authInfo,
      ws,
      project,
      sort,
      before,
      after,
      first,
      last,
      inclusive,
      modelName: this.modelName,
      watch: this.watch
    });

    // watches all cursors
    changeStream.on('change', (node) => {
      const cursor = modelToCursor(node);

      changedDocuments.push({
        cursor,
        node
      });
    });
  }

  // ========================

  const out = await getConnection({
    first,
    last,
    after,
    before,
    inclusive,
    sort,
    filter,
    authInfo,
    hint,
    project,
    maxTimeMS,
    maxScan
  });

  const history = map(out.edges, edge => edge.cursor);
  changeStream.on('change', receiveChange({
    schema: this.modelName,
    cursorHistory: history,
    ws,
    sort
  }));

  out.edges = map(out.edges, ({ cursor, node }) => {
    const replacementEdge = find(changedDocuments, ({ cursor: wsCursor }) => wsCursor === cursor);
    if (replacementEdge) {
      return replacementEdge;
    }
    return {
      cursor,
      node
    };
  });

  // if live updates are enabled
  if (isUndefined(before) && isUndefined(after)) {
    // setup the websocket
    this.getConnectionWs({
      filter,
      authInfo,
      ws,
      project,
      sort,

      after: undefined,
      before: out.pageInfo.endCursor,
      inclusive: true,
      first: undefined,
      last: Number.MAX_SAFE_INTEGER,

      hint,
      maxTimeMS,
      maxScan
    });
  } else {

  }

  return out;
}

export default function addWSFunctions(schema) {
  schema.statics.getConnectionWs = getConnectionWs;
}