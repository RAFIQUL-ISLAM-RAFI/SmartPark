const asyncHandler = require('../utils/asyncHandler');
const { getActivity } = require('../services/reportService');

const listActivity = asyncHandler(async (req, res) => {
  const { filter, search, sort, page, pageSize } = req.query;
  const result = await getActivity({ filter, search, sort, page, pageSize });
  res.json({ success: true, ...result });
});

module.exports = { listActivity };
