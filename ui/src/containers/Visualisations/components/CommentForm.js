import React from 'react';
import PropTypes from 'prop-types';

/**
 * @param {string} props.visualisationId
 * @param {string} propscomment
 * @param {(comment: string) => void} props.onChange
 */
const CommentForm = ({
  visualisationId,
  comment,
  onChange,
}) => {
  const formId = `visualisation-comment-${visualisationId}`;

  return (
    <div className="form-group">
      <label htmlFor={formId}>
        Comment
      </label>

      <input
        id={formId}
        className="form-control"
        placeholder="Comment"
        value={comment}
        onChange={e => onChange(e.target.value)} />
    </div>
  );
};

CommentForm.propTypes = {
  visualisationId: PropTypes.string.isRequired,
  comment: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default React.memo(CommentForm);