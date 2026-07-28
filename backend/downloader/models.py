from django.db import models


class SearchHistory(models.Model):
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='search_history')
    query = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at',)
        constraints = [
            models.UniqueConstraint(fields=('user', 'query'), name='unique_user_search'),
        ]

# Create your models here.
